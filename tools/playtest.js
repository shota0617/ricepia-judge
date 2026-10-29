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
  const { howto, kome, ...ctxOpts } = opts;
  const ctx = await browser.newContext({ viewport: VIEW, deviceScaleFactor: 2, ...ctxOpts });
  await ctx.addInitScript(([howto, kome]) => {
    if (!howto) localStorage.setItem('nsg_howto', '1');
    if (!kome && !localStorage.getItem('nsg_kome_talk')) localStorage.setItem('nsg_kome_talk', '0');   // お米つぶの おはなしは 下の komeTalk で（ほかの 台本の じゃまに しない）   // 「あそびかた」は 読んだことに（はじめての人の 案内は 下の howtoFirst で）
    localStorage.setItem('nsg_auto', 'false');   // おまかせ歩きは止めて、台本どおりに歩く
    if (!localStorage.getItem('nsg_roll')) { localStorage.setItem('nsg_roll', '0'); localStorage.setItem('nsg_roll_v2', '1'); }   // 台本は1マスずつ歩く（かたむけて転がすのは、下の roll のチェックで）
    // 転がり方は 日づけで きまる「きょうの転がり方」の まま（台本の 道のりで 新しい 転がり方を もらって 押す強さ・はね返りが かわると、転がる チェックの 数が 回ごとに ずれた。もらう ことは koroDist の チェックで）
    if (!localStorage.getItem('nsg_koro')) localStorage.setItem('nsg_koro', JSON.stringify({ u: [], sel: 'daily', dist: -1e9, n: 0 }));
    if (!localStorage.getItem('nsg_view')) { localStorage.setItem('nsg_view', 'px'); localStorage.setItem('nsg_world_on', '0'); }
    window.__played = [];   // 鳴らした音（効果音・BGM）を記録する
    window.__rewards = [];   // 出たごほうびの知らせ（あとから出たものに消されても、出たことは分かるように）
    setInterval(() => { if (window.NISHIO_MOVIE && NISHIO_MOVIE.playing && !window.__keepMovie) NISHIO_MOVIE.close(); }, 200);   // 名所で流れる ドット絵ムービーは閉じて先へ（ムービーは下の movie のチェックで見る）
    document.addEventListener('DOMContentLoaded', () => { const r = document.getElementById('reward'); if (!r) return; new MutationObserver(() => { if (r.innerText) window.__rewards.push((r.innerText + ' ' + [...r.querySelectorAll('[title]')].map(e => e.title).join(' ')).replace(/\s+/g, ' ').slice(0, 400)); }).observe(r, { childList: true }); });
    const play = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function () { window.__played.push(this.src.split('/').pop()); return play.call(this); };
  }, [!!howto, !!kome]);
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

// 転がる チェックが 落ちた ときに 分かるように：はじめの ようす（位置・転がり方・押す強さ・坂・地面・天気）と、こまごとの ようす（止められた わけ）を 記録する
const rollEnv = page => page.evaluate(() => { const r = nishioPixel.roll, k = window.NISHIO_KOROSTYLE && NISHIO_KOROSTYLE.current(), p = k ? k.motion.p : {}, M = nishioPixel.maze, w = window.NISHIO_WEATHER && NISHIO_WEATHER.current;
  return { at: r.x === null ? null : [+r.x.toFixed(2), +r.y.toFixed(2)], cell: r.x === null || !M.on() ? null : [Math.floor(r.x / M.K), Math.floor(r.y / M.K)], style: k ? k.name : '', accel: p.accel || 1, slope: r.slope && { x: +r.slope.x.toFixed(2), y: +r.slope.y.toFixed(2), g: +r.slope.g.toFixed(4), known: r.slope.known }, ground: r.ground, wx: (w && w.kind) || '', maze: M.on() }; });
const traceOn = page => page.evaluate(() => { const T = window.__rt = { f: [], on: true, r0: (window.__rewards || []).length }, info = document.getElementById('pxInfo');
  const why = () => [nishioPixel.sightBusy() && 'sight', !!document.querySelector('.medashi:not([hidden])') && 'medashi', !info.hidden && 'pxInfo', nishioPixel.mapCovered(true) && ('cover:' + ([...document.querySelectorAll('#pxInfo:not([hidden]), .panel:not([hidden]), [role="dialog"]:not([hidden])')].map(e => e.id || e.className).join(',') || (document.getElementById('reward').classList.contains('show') ? 'reward' : document.body.classList.contains('jump-open') ? 'jump' : '?')))].filter(Boolean).join('+');
  const tick = t => { if (!T.on) return; const r = nishioPixel.roll; T.f.push([t, r.x, r.y, why()]); requestAnimationFrame(tick); }; requestAnimationFrame(tick); });
const traceOff = page => page.evaluate(() => { const T = window.__rt; if (!T) return null; T.on = false; const f = T.f; if (f.length < 2) return { n: f.length };
  let gap = 0; const busy = {}; for (let i = 1; i < f.length; i++) { gap = Math.max(gap, f[i][0] - f[i - 1][0]); if (f[i][3]) busy[f[i][3]] = (busy[f[i][3]] || 0) + 1; }
  return { n: f.length, ms: Math.round(f[f.length - 1][0] - f[0][0]), gap: Math.round(gap), busy, rewards: (window.__rewards || []).slice(T.r0).map(t => t.slice(0, 50)), path: f.filter((_, i) => i % 6 === 0).map(x => [+(x[1] || 0).toFixed(2), +(x[2] || 0).toFixed(2)]).slice(0, 24) }; });

// 転がす 前に、お米を 止める 窓（ごほうび・本の できごと など）を 閉じる（めいろでは 窓が 出ている 間 転がらない）。閉じきれたら true
const uncover = page => page.evaluate(async () => {
  for (let i = 0; i < 20; i++) {
    if (!nishioPixel.mapCovered(true) && !document.querySelector('.medashi:not([hidden])') && !nishioPixel.sightBusy()) return true;
    const r = document.getElementById('reward'); if (r.classList.contains('show')) r.click();
    const x = document.querySelector('#pxInfo:not([hidden]) [data-close]'); if (x) x.click();
    document.querySelectorAll('.medashi:not([hidden]) .md-close').forEach(b => b.click());
    await new Promise(f => setTimeout(f, 150));
  }
  return false;
});
const traceBusy = tr => !!tr && Object.keys(tr.busy || {}).length > 0;   // はかって いる 間に、窓などで お米が 止められた こまが あった

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
    // はじめての 絵の「NEW」の 札が、名前（「ようこそ！…」）の 字に 重ならない（自分で 遊んで 分かった：札が 1文字目の「よ」に 重なって 読めなかった）
    const ribbon = await page.evaluate(() => {
      const rb = document.querySelector('#reward .ribbon'), pl = document.querySelector('#reward .rw.hero .place');
      if (!rb || !pl) return { has: false };
      const a = rb.getBoundingClientRect(), rg = document.createRange(); rg.selectNodeContents(pl);
      return { has: true, hit: [...rg.getClientRects()].some(t => t.left < a.right && t.right > a.left && t.top < a.bottom && t.bottom > a.top) };
    });
    return { id, name: plan.name, straightM: plan.straight, steps: plan.keys.length, first, ribbon, reached: /たからばこ/.test(popup.text) && popup.facts > facts0 && (/💡/.test(popup.text) || popup.book) };
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
  // はじめの画面の いちばん上は「🌀 傾けて めいろ」（地図の めいろ）。台本は めいろなしの 1マスずつ 歩く で 始める
  // （めいろだと 始めた 所が 壁の かたまりの 中なら すぐ 通路へ うつるので、この先の 台本の 位置が かわる。めいろは あとの mapMaze で）
  R.checks.meiroMain = await page.evaluate(() => { const b = document.getElementById('meiroBtn'); return !!b && b.offsetParent !== null && /傾けて めいろ/.test(b.textContent) && document.getElementById('demoBtn').hidden; });
  await page.evaluate(() => document.getElementById('demoBtn').click());
  await page.waitForTimeout(2500);
  // 文字を少なく（ふだん）：上のバーは文字を出さず、ドット絵だけ。下のタブは 絵と 小さな 名前（絵だけだと 分かりにくい）
  R.checks.simpleDefault = await page.evaluate(() => document.body.classList.contains('simple') && !!document.querySelector('.tabs img.pi') && getComputedStyle(document.querySelector('.tabs button span')).display !== 'none' && getComputedStyle(document.querySelector('.brand .tx')).display === 'none');
  R.checks.firstOnField = await page.evaluate(() => nishioGo.demo && !nishioPixel.worldMode && !document.getElementById('pxPad').hidden);
  R.checks.welcomeChestM = await page.evaluate(() => { const c = nishioGo.liveChests().find(x => x.id.endsWith(':welcome')); return c ? Math.round(nishioGo.dist(nishioGo.me, c)) : null; });
  // せかいちずでもスティックが出て、動かすと歩く地図にもどる
  await page.evaluate(() => nishioPixel.setWorld(true)); await page.waitForTimeout(500);
  R.checks.padOnWorldMap = await page.evaluate(() => nishioGo.demo && nishioPixel.worldMode && !document.getElementById('pxPad').hidden);
  // 地図が めいろに なったので、画面の スティック・📱転がす・🚗車・地図の 切りかえ と、せっていの ドット絵の地図・Godot は はずした
  R.checks.controlsGone = await page.evaluate(() => ['pxStick', 'pxRoll', 'pxCar', 'viewBtn', 'pxToggle', 'godotToggle'].every(id => !document.getElementById(id)) && !!document.getElementById('pxMeiro'));
  // 矢印キーの上を 何回か（北へ 歩く。せかいちずなら 歩く地図に もどってから）
  const lat0 = await page.evaluate(() => nishioGo.me && nishioGo.me.lat);
  for (let i = 0; i < 4; i++) { await page.keyboard.press('ArrowUp'); await page.waitForTimeout(150); }
  await page.waitForTimeout(500);
  R.checks.keyWalkedNorth = await page.evaluate(l => !!nishioGo.me && l != null && nishioGo.me.lat > l && !nishioPixel.worldMode, lat0);
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
  R.checks.h100FirstDay = await page.evaluate(() => !(nishioGo.state.day || {}).h100);   // きょうの100歩たんけんは、遊びはじめた日には始まらない
  await page.evaluate(() => localStorage.setItem('nsg_first_day', JSON.stringify('2026-10-15')));   // ここからは 2日目の人として（100歩たんけんを見る）
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
  // 芽出しは こよみの 田おこし・田植えの ころ（4〜6月）だけ。台本の 日付（10月）では 出ないので、ここだけ 田おこしの ころに する
  R.checks.medashiSeason = await page.evaluate(() => {
    const S = window.NISHIO_SEASON, G = nishioGo, p0 = S.paddy, res = {};
    for (const m of [12, 1, 4, 5, 6, 10]) { S.paddy = () => p0(new Date(2026, m - 1, 15)); res[m] = G.medashiDue(); }
    S.paddy = p0;
    return { ...res, ok: !res[12] && !res[1] && !res[10] && res[4] && res[5] && res[6] };
  });
  R.checks.medashi = await page.evaluate(async () => {
    const M = window.NISHIO_MEDASHI, G = nishioGo, bad = [], S = window.NISHIO_SEASON, p0 = S.paddy;
    if (!M) return 'none';
    if (G.state.medashiDay === G.ymd()) return 'もう今日は遊んだことになっている';
    S.paddy = () => p0(new Date(2026, 3, 20));   // 田おこしの ころ（芽出しの イベントが 出る）
    try {
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
    } finally { S.paddy = p0; }
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
  // 第5弾：めぐりの れんさ（30分以内に ちがう名所へ着くと ×1.2・×1.5・×2）と、歩いた道の節目（500m・1km・2km…）
  R.checks.chain = await page.evaluate(() => { const c = nishioGo.state.chain, said = window.__rewards.some(t => /めぐりの れんさ/.test(t)), st = document.getElementById('status'), line = !st.hidden && /れんさ \d+ のこり\d+分/.test(st.textContent); return { best: c ? c.best : 0, said, line, status: st.textContent.slice(0, 120), ok: !!c && c.best >= 2 && said && line }; });   // line：文字を少なく（ふだん）でも、上の段に れんさ の のこり時間が出る
  // プレイ画面の 字を 大きく シンプルに（運営者の声 2026-10-27）：時計の 字は 18点、下の 札に「次の名所 → れんさ」の 小さい 字を 出さない（文字を少なく）
  //   浮かぶ 文字（「+3pt」「ぜんぶ ひろったじゃん！」など）は 16点の 太い 字
  R.checks.bigText = await page.evaluate(async () => {
    const st = document.getElementById('status'), simple = document.body.classList.contains('simple') || !!document.querySelector('#status .pia'), P = nishioPixel;
    const floatPx = Math.max(P.FLOAT_PX, P.floatPx);
    // つづけて たくさん 来ても、待ちは のびつづけない（4つ まで、のこりの 出番を つめなおす）
    P.floatsClear(); for (let i = 0; i < 12; i++) P.floatText(`テストの 浮かぶ 文字 ${i}`);
    const ats = P.floatAts(), texts = P.floats(); P.floatsClear();
    const tabSpan = document.querySelector('.tabs button span'), tabPx = tabSpan ? parseFloat(getComputedStyle(tabSpan).fontSize) : 0;   // 下の メニューの 名前（12点の 太い 字）   // 描いた 大きさは スクショで 確かめた（ここで 文字を 浮かべて 待つと、あとの チェックの 人の 位置・知らせの 時間が ずれる）
    return { clockS: P.maze.clockS, tapK: P.maze.tapK, floatPx, tabPx, ats, last: texts[texts.length - 1], teaser: /次の名所 → れんさ/.test(st.textContent), simple, ok: P.maze.clockS >= 18 && P.maze.tapK * 24 >= 12 && floatPx >= 16 && (!simple || tabPx >= 12) && ats.length === 4 && Math.max(...ats) <= 4 * 1250 && texts[3] === 'テストの 浮かぶ 文字 11' && !(simple && /次の名所 → れんさ/.test(st.textContent)) };
  });
  R.checks.h100 = await page.evaluate(() => { const h = (nishioGo.state.day || {}).h100 || {}; return { steps: h.steps, fresh: h.fresh, done: !!h.done, best: nishioGo.state.h100best, ok: !!h.done && h.steps === 100 && h.fresh > 0 && nishioGo.state.h100best === h.fresh }; });   // きょうの100歩たんけん：3か所めぐる間に100歩おわる
  R.checks.trailMile = await page.evaluate(() => { const st = nishioGo.state, logged = st.log.some(l => l.type === 'trailmile'); return { mile: st.trailMile, trail: st.trail, logged, ok: st.trailMile >= 1 && logged }; });
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
    await page.evaluate(() => nishioPixel.setRoll(true));
    await page.waitForTimeout(300);
    let a, b, env, tr, tries = 0;
    do {   // 押して いる 間に 窓（ごほうび など）が 出て 止められたら、閉じて もう一度（3回まで）
      await uncover(page); await page.waitForTimeout(100);
      a = await page.evaluate(() => nishioPixel.roll); env = await rollEnv(page);
      await traceOn(page);
      await page.keyboard.down('ArrowRight'); await page.waitForTimeout(1000); await page.keyboard.up('ArrowRight');
      await page.waitForTimeout(600);
      b = await page.evaluate(() => nishioPixel.roll); tr = await traceOff(page);
    } while (traceBusy(tr) && ++tries < 3);
    // スマホの傾き：はじめの持ち方（40度）を まっすぐにして、左へ20度傾けると 左へ転がる
    await page.evaluate(() => { for (let i = 0; i < 10; i++) window.dispatchEvent(new DeviceOrientationEvent('deviceorientation', { alpha: 0, beta: 40, gamma: 0 })); });
    for (let i = 0; i < 20; i++) { await page.evaluate(() => window.dispatchEvent(new DeviceOrientationEvent('deviceorientation', { alpha: 0, beta: 40, gamma: -20 }))); await page.waitForTimeout(50); }
    await page.evaluate(() => window.dispatchEvent(new DeviceOrientationEvent('deviceorientation', { alpha: 0, beta: 40, gamma: 0 })));
    await page.waitForTimeout(600);
    const c = await page.evaluate(() => nishioPixel.roll);
    await page.evaluate(() => nishioPixel.setRoll(false));
    const ok = !!(a.ready && (b.d - a.d > 0.8) && (Math.abs(b.x - a.x) > 0.8 || Math.abs(b.y - a.y) > 0.3) && (c.d - b.d > 0.5));
    return { ready: a.ready, moved: +(b.x - a.x).toFixed(2), rolled: +(b.d - a.d).toFixed(2), tilt: +(c.x - b.x).toFixed(2), tries, ...(ok ? {} : { env, tr }), ok };
  })();
  // 坂（本当の高低差）：平らなら さわらなくても動かない。東西南北のどれかに 10% 下る坂を差しこむと、さわらなくても 下る向きへ転がる（かべのない向きで確かめる）
  R.checks.slope = await (async () => {
    let r, env, tr, tries = 0;
    do {   // はかって いる 間に 窓（ごほうび など）が 出て 止められたら、閉じて もう一度（3回まで）
      await page.evaluate(() => nishioPixel.setRoll(true)); await uncover(page); await page.waitForTimeout(100);
      env = await rollEnv(page); await traceOn(page);
      r = await page.evaluate(async () => {
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
      tr = await traceOff(page);
    } while (traceBusy(tr) && ++tries < 3);
    return { ...r, tries, ...(r.ok ? {} : { env, tr }) };
  })();
  // 転がり方の みがき：はなすと 3.5秒のうちに ぴたっと止まる（いつまでも じわじわ動かない）。かべに押しつけても がたがたしない（さいごの1秒は その場から動かない）
  R.checks.rollFeel = await (async () => {
    await page.evaluate(() => nishioPixel.setRoll(true)); await page.waitForTimeout(400);
    const look = () => page.evaluate(() => { const r = nishioPixel.roll, out = []; for (const [k, dx, dy] of [['ArrowLeft', -1, 0], ['ArrowRight', 1, 0], ['ArrowUp', 0, -1], ['ArrowDown', 0, 1]]) { let d = 1; while (d < 9 && !nishioPixel.rollBlockedFrom(r.x + dx * (d - 1), r.y + dy * (d - 1), r.x + dx * d, r.y + dy * d)) d++; out.push([k, d, dx, dy]); } return out.sort((p, q) => q[1] - p[1]); });
    const [open] = await look();
    await page.keyboard.down(open[0]); await page.waitForTimeout(900); await page.keyboard.up(open[0]);
    // 止まるまでの 時間は ページの 中の 時計で はかる（テストと ページの やりとりの 待ちを 入れない。遅い 画面で 長く 出て 落ちていた）
    const stopMs = await page.evaluate(async () => { const t0 = performance.now(); while (performance.now() - t0 < 4000) { await new Promise(f => setTimeout(f, 50)); const r = nishioPixel.roll; if (r.vx === 0 && r.vy === 0) return performance.now() - t0; } return null; });
    const stopped = stopMs !== null, stopS = +((stopped ? stopMs : 4000) / 1000).toFixed(1);
    let still = 'no-wall';
    const dbg = { style: await page.evaluate(() => { const k = window.NISHIO_KOROSTYLE && NISHIO_KOROSTYLE.current(); return k ? k.name : ''; }) };   // 落ちたときに 分かるように
    const wall = (await look()).pop();   // 止まった所から いちばん近い かべ
    if (wall[1] < 9) {
      await page.keyboard.down(wall[0]); await page.waitForTimeout(4500);   // かべまで転がって、はね返りが おさまるまで
      const vs = [];
      const ps = [];   // かべの向きの位置（速さは 押しつけている間 1こまだけ 少し つくことがあるので、目に見える 位置のゆれで見る）
      for (let i = 0; i < 10; i++) { await page.waitForTimeout(100); const r = await page.evaluate(() => nishioPixel.roll); vs.push(Math.abs(wall[2] ? r.vx : r.vy)); ps.push(wall[2] ? r.x : r.y); }
      await page.keyboard.up(wall[0]);
      dbg.spread = +(Math.max(...ps) - Math.min(...ps)).toFixed(3); dbg.vmax = +Math.max(...vs).toFixed(3); dbg.wall = wall[0];
      still = dbg.spread < 0.02 && dbg.vmax < 0.2;   // さいごの1秒で 0.02マス（約16cm）も動かない。速さも はね返りほどには ない
    }
    await page.evaluate(() => nishioPixel.setRoll(false));
    const rr = await page.evaluate(() => { const r = nishioPixel.roll; return { round: r.round, flat: r.flat, f0: r.flat }; });
    await page.waitForTimeout(500);
    const flatGrew = (await page.evaluate(() => nishioPixel.roll.flat)) - rr.f0;   // 丸いお米が描けるのに、古い絵（平らな お米）を重ねて描いていないか
    return { stopS, still, spread: dbg.spread, vmax: dbg.vmax, style: dbg.style, wall: dbg.wall, round: rr.round, flatGrew, ok: stopped && stopS <= 3.5 && still !== false && rr.round && flatGrew === 0 };
  })();
  // お米に 赤ちゃんの ような かわいさ（運営者の声 2026-10-28）：ふだんの 顔に 目の きらっ・止まって しばらくすると あくび（6秒 すぎ）・もっと たつと すやすや
  R.checks.babyRice = await page.evaluate(() => {
    const P = nishioPixel;
    if (!P.riceFace || !P.moodAt) return { ok: false, why: 'no-api' };
    const f = P.riceFace(), m = { a: P.moodAt(3), y: P.moodAt(6.3), b: P.moodAt(8), s: P.moodAt(13) };
    return { ...f, m, ok: f.keys.includes('yawn') && f.shine >= 2 && m.y === 'yawn' && m.s === 'sleepy' && m.a !== 'yawn' && m.b !== 'yawn' };
  });
  // なめらかに ころころ（運営者の声 2026-10-28「この キャラクターくらい 滑らかに」）：お米は 画面の 細かさで 描き（絵の1点を 何ピクセルかで）、
  // ふちは なめらか（半とうめいの ふち）、影は 段でなく 連続（色の 数が 多い）、位置は 整数に 丸めない（0.3 ずらすと 絵が かわる）
  R.checks.smoothRice = await page.evaluate(() => {
    const P = nishioPixel;
    if (!P.riceLast || !P.drawRice) return { ok: false, why: 'no-api' };
    const c = document.createElement('canvas'); c.width = c.height = 200; const x = c.getContext('2d');
    const draw = X => { x.clearRect(0, 0, 200, 200); P.drawRice(x, X, 100, 0.4, 0, 'smile', 0, '', 3); return x.getImageData(0, 0, 200, 200).data; };
    const a = draw(100), L = P.riceLast(), b = draw(100.4);
    let diff = 0; for (let i = 3; i < a.length; i += 4) if (Math.abs(a[i] - b[i]) > 8) diff++;
    const ring = [0.5625, 0.2, 0.04].map(u => { x.clearRect(0, 0, 200, 200); P.drawRice(x, 100, 100, 0.4, 0, 'smile', 0, '', u); return P.riceLast().ring; });   // 小さく 描いても（せかいちず・めいろの 落ちる えんしゅつ）形の 外は とうめい（うすい 四角が 出ない。Codex の 指摘）
    return { P: L.P, S: L.S, soft: L.soft, solid: L.solid, tones: L.tones, diff, ring, ok: L.P === 3 && L.S >= 48 * 3 && L.soft >= 60 && L.tones >= 24 && diff >= 20 && ring.every(v => v === 0) };
  });
  // すう すう 息：止まって いる お米は ゆっくり 息を する（足もとは 地面の まま。点より 細かく 描くので 0.5 ピクセルでも 見える）
  R.checks.riceBreath = await (async () => {
    const ok0 = await page.evaluate(() => !!(nishioPixel.breathAt && nishioPixel.riceLast));
    if (!ok0) return { ok: false, why: 'no-api' };
    const ys = [];   // 歩く地図の お米の 高さ（roll.by。riceLast は ほかの 絵の お米でも かわる ので つかわない）
    for (let i = 0; i < 14; i++) { const r = await page.evaluate(() => { const R = nishioPixel.roll; return R.kind === 'stop' && R.v < 0.2 && R.h <= 0 && typeof R.by === 'number' ? R.by : null; }); if (r !== null) ys.push(r); await page.waitForTimeout(100); }
    const rg = ys.length ? Math.max(...ys) - Math.min(...ys) : 0, b = await page.evaluate(() => [nishioPixel.breathAt(0), nishioPixel.breathAt(650)]);
    return { n: ys.length, rg: +rg.toFixed(2), b, ok: ys.length >= 8 && rg > 0.15 && rg < 4 && Math.abs(b[0]) < 1e-9 && b[1] > 0.01 && b[1] < 0.04 };
  })();
  // ねむって いる お米の 頭に ちょうちょが 飛んで きて とまる（文字の ない 素朴な かわいさ）。3秒で とまり、遠くから 来る
  R.checks.riceBfly = await (async () => {
    const P0 = await page.evaluate(() => { const P = nishioPixel; if (!P.bflyIn) return null; const a = P.bflyIn(0), b = P.bflyIn(4); return { a: [Math.round(a.dx), Math.round(a.dy)], rest: b.rest, b: [b.dx, b.dy] }; });
    if (!P0) return { ok: false, why: 'no-api' };
    let st = null;
    await page.evaluate(() => nishioPixel.setIdle && nishioPixel.setIdle(13));   // ねむった ところから（ねむるまで 12秒 待たない。rollPut は 1歩 あるいた ことに なり、バッジなどの 知らせが ふえて あとの 確認（kiraFar）が 落ちた ので 使わない）
    for (let i = 0; i < 40; i++) { st = await page.evaluate(() => ({ ...nishioPixel.bfly, mood: nishioPixel.roll.mood })); if (st.phase === 'rest' || st.calm) break; await page.waitForTimeout(250); }
    const z0 = await page.evaluate(() => (nishioPixel.zzz ? nishioPixel.zzz.n : -1));
    const d0 = st.drawn; await page.waitForTimeout(300); const d1 = await page.evaluate(() => nishioPixel.bfly.drawn);
    const zz = await page.evaluate(() => nishioPixel.zzz || null);   // すやすやの Z も 点より 細かい 位置で なめらかに のぼる
    // ゲームボーイの4色では 点の まま 整数の 位置に（なめらかに まぜると 4色 いがいの 色が 出る。Codex の 指摘）
    const gb = await page.evaluate(async () => { const P = nishioPixel; if (!P.setGb) return { smooth: null, at: null }; P.setGb(true); for (let i = 0; i < 3; i++) await new Promise(r => requestAnimationFrame(r)); const b = P.bfly; P.setGb(false); return { smooth: b.smooth, at: b.at }; });
    const gbOk = st.calm || (gb.smooth === false && !!gb.at && gb.at.every(v => Number.isInteger(v)));
    const zOk = !!zz && zz.n > z0 && !!zz.at && !zz.at.every(v => Number.isInteger(v));
    const kindOk = st.calm || st.kind === (st.season === 'tonbo' ? 'tonbo' : 'chocho');   // 秋（季節の 虫が 赤とんぼの ころ）は 赤とんぼが とまる
    return { ...P0, st, more: d1 - d0, gb, zz, ok: gbOk && zOk && kindOk && (st.calm || (st.phase === 'rest' && d1 > d0 && P0.a[0] > 30 && P0.rest && P0.b[0] === 0 && P0.b[1] === 0)) };
  })();
  // おきた ときの「のびー」：ねむって いた お米が おきると 0.6秒 たてに のびる（赤ちゃんの ような かわいさ）。ちょうちょは 飛んで いく
  R.checks.riceWake = await page.evaluate(async () => {
    const P = nishioPixel, f = () => new Promise(r => requestAnimationFrame(r));
    if (!P.riceWake || !P.setIdle) return { ok: false, why: 'no-api' };
    const w = [P.riceWake(0), P.riceWake(300), P.riceWake(700)].map(v => +v.toFixed(3));
    P.setIdle(14); await f(); await f(); const t0 = performance.now(); P.setIdle(0); await f(); await f();
    const wt = P.wakeT, calm = P.bfly.calm; await new Promise(r => setTimeout(r, 200)); const ph = P.bfly.phase;
    return { w, woke: wt >= t0, ph, calm, ok: calm || (w[0] === 0 && w[1] > 0.08 && w[2] === 0 && wt >= t0 && ph === 'out') };
  });
  // ころころ ×10 は 文字を 出さず 大きな きらきら（数は お米の よこの「×N」に 見えて いる。同じ ことを 2か所に 書かない）
  R.checks.comboTen = await page.evaluate(async () => {
    const P = nishioPixel, n0 = P.combo.n, b0 = P.combo.best, t0 = performance.now();
    P.comboBest(1000); P.floatsClear(); P.comboAdd(10 - (n0 % 10));   // ベストを こえない ように（こえると beat が のこり、あとの comboBest が 落ちる）
    const fl = P.floats().slice(), pop = P.combo.pop;
    P.comboAdd(-P.combo.n); P.comboBest(b0); P.floatsClear();   // もとに もどす（コンボを おわらせない ので ベストは かわらない）
    return { fl, popped: pop >= t0, ok: !fl.some(t => /ころころ ×\d+！/.test(t)) && pop >= t0 };
  });
  // お米を 描く 重さ：3倍の 画面の 大きさ（u=4）でも 1こまの 時間に 十分 おさまる（なめらかに した ぶん 重く なって、かくつかない ように。Math.hypot・Math.pow を やめ、うすい のこりかげは あらく 描く）
  R.checks.ricePerf = await page.evaluate(() => {
    const P = nishioPixel, c = document.createElement('canvas'); c.width = c.height = 400; const x = c.getContext('2d');
    for (let i = 0; i < 3; i++) P.drawRice(x, 200.3, 200.6, i * 0.2, 0, 'smile', 0, '', 4);   // あたため
    const t0 = performance.now(); for (let i = 0; i < 20; i++) P.drawRice(x, 200.3, 200.6, i * 0.15, 0, 'smile', 0, '', 4);
    const ms = (performance.now() - t0) / 20, L = P.riceLast();   // ふつうの お米は あらく しない（のこりかげ だけ）
    return { ms: +ms.toFixed(2), P: L && L.P, lowQ: L && L.lowQ, ok: ms < 6 && !!L && L.P === 4 && L.lowQ === false };
  });
  // ぽちゃん のあとの 水の しずくも 1枚の 絵で 点より 細かい 位置に（1点ずつ カクカク すべって いた）
  R.checks.dropSmooth = await page.evaluate(async () => {
    const P = nishioPixel; if (!P.setWet || !P.drop) return { ok: false, why: 'no-api' };
    const n0 = P.drop.n; P.setWet(1.2); for (let i = 0; i < 4; i++) await new Promise(r => requestAnimationFrame(r));
    const d = P.drop; P.setWet(0);
    return { n: d.n - n0, at: d.at, ok: d.n > n0 && !!d.at && !d.at.every(v => Number.isInteger(v)) };
  });
  // 知らせが 出て いる ときに 窓（本のできごと など）が 開いたら、知らせは すっと 消える（0.3秒 うすれる 間 窓の 題名に かぶって いた）
  R.checks.toastSnap = await page.evaluate(async () => {
    const G = nishioGo, B = window.NISHIO_BOOKEV, el = document.getElementById('toast'), wait = ms => new Promise(r => setTimeout(r, ms));
    if (!B) return { ok: false, why: 'no-bookev' };
    const ev = B.EVENTS.find(e => !e.game && !(G.bookEvHas && G.bookEvHas(e.id)));
    if (!ev) return { ok: true, skipped: 'no-event' };
    G.toast('🧭 テストの 知らせ'); await wait(450);
    const before = +getComputedStyle(el).opacity;
    if (!B.open(ev)) return { ok: true, skipped: 'not-opened', before };
    await new Promise(r => requestAnimationFrame(r));
    const op = +getComputedStyle(el).opacity;
    B.close(); await wait(100);
    return { before, op, ok: before > 0.9 && op < 0.05 };
  });
  // お米の 影も なめらかに：まるい だ円を 点より 細かい 位置に 描く（整数に 丸めた 点の 四角だと、なめらかに 動く お米の 下で 影だけ カクッと 動く）
  R.checks.smoothShadow = await page.evaluate(async () => {
    const P = nishioPixel, E = CanvasRenderingContext2D.prototype, keep = E.ellipse, cv = document.getElementById('pxCanvas'), hits = [];
    E.ellipse = function (x, y, rx, ry) { if (this.canvas === cv && String(this.fillStyle).replace(/\s/g, '') === 'rgba(0,0,0,0.28)') hits.push([x, y, rx, ry]); return keep.apply(this, arguments); };
    try { for (let i = 0; i < 4; i++) await new Promise(r => requestAnimationFrame(r)); } finally { E.ellipse = keep; }
    const b = P.riceBox, c = b && [(b[0] + b[2]) / 2, b[3]], near = c ? hits.filter(h => Math.abs(h[0] - c[0]) < 2 && h[2] > 3) : [];
    return { n: hits.length, near: near.length, first: near[0] && near[0].map(v => +v.toFixed(2)), ok: near.length > 0 };
  });
  // Godot の 記録係（?godot=1 の ためし）：歩く地図を 描く ときに 使う canvas の 命令が、記録係にも ぜんぶ ある（ない 命令で 止まると その こまの 絵が 送られない。Codex の 指摘：影の ellipse）
  R.checks.godotRec = await page.evaluate(async () => {
    const N = window.NSG_GODOT, rec = N && N.rec, errs = [], on = N && N.on;
    if (!rec) return { ok: false, why: 'no-rec' };
    const onErr = e => errs.push(String(e.message || e.error || e).slice(0, 120));
    window.addEventListener('error', onErr);
    document.querySelectorAll('.medashi').forEach(m => { m.hidden = true; }); document.getElementById('pxInfo').hidden = true; const rw = document.getElementById('reward'); if (rw.classList.contains('show')) rw.click();
    let shade = 0; const fill0 = rec.fill;
    rec.fill = function () { if (String(this.fillStyle).replace(/\s/g, '') === 'rgba(0,0,0,.28)') shade++; return fill0.apply(this, arguments); };   // お米の 影まで 描けたか（お米が 描かれない こまでは この 確認に ならない）
    N.on = () => true;   // Godot が 動いて いる ことに して、歩く地図を 記録係で 描かせる（Godot は 読みこまない）
    let len = 0;
    try { for (let i = 0; i < 6; i++) { await new Promise(r => requestAnimationFrame(r)); len = Math.max(len, rec.out.length); } }
    finally { N.on = on; rec.fill = fill0; for (let i = 0; i < 2; i++) await new Promise(r => requestAnimationFrame(r)); window.removeEventListener('error', onErr); }
    return { errs: [...new Set(errs)], len, shade, ok: !errs.length && len > 50 && shade > 0 };
  });
  // たての 転がり方：上・下へ 転がると 前・うしろへ でんぐりがえし（pitch が 回る。こまのような くるくる＝spin には ならない。転がり方「くるくる」の日は のぞく）
  R.checks.rollVert = await (async () => {
    // べつの ページで 確かめる（お米を 平らな 所へ 動かしたり、転がる 間に 宝箱・ゴール・人の 話が 起きたりしても、あとの 確認に のこらない。Codex の 指摘）
    const v = await newPage(browser), page = v.page;
    try {
      await page.goto(URL); await page.waitForTimeout(1500);
      await page.click('#meiroBtn'); await page.waitForTimeout(1500);   // 「🌀 傾けて めいろ」
      await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => /わかった/.test(x.textContent) && x.offsetParent); if (b) b.click(); }); await page.waitForTimeout(600);
      await page.evaluate(() => document.querySelector('[data-pick-dot]')?.click()); await page.waitForTimeout(900);   // はじめの 1枚
      await uncover(page);
      await page.evaluate(() => nishioPixel.setRoll(true)); await page.waitForTimeout(400);
      // 平らで まっすぐ たてに 5マス 以上 ころがれる 所から 始める（いまの 場所の ままだと、坂で 止まらずに 転がりつづけたり、場所が せまくて とばしたりして、ときどき 落ちていた）
      const info = await page.evaluate(async () => {
        const P = nishioPixel, r = P.roll, M = P.maze, k = window.NISHIO_KOROSTYLE && NISHIO_KOROSTYLE.current(), style = k ? k.name : '';
        const room = (x0, y0, dy) => { const tube = M.on() && M.near ? (y => { const q = M.near(x0, y); return !q || q.d <= 0.5; }) : () => true; let d = 1; while (d < 9 && !P.rollBlockedFrom(x0, y0 + dy * (d - 1), x0, y0 + dy * d) && tube(y0 + dy * d)) d++; return d; };
        const flat = (x0, y0, dy, d) => { for (let j = 0; j <= d; j++) { const sl = P.slopeAt(x0, y0 + dy * j); if (sl.x || sl.y) return false; } return true; };
        let best = null, moved = false;
        for (const [key, dy] of [['ArrowDown', 1], ['ArrowUp', -1]]) { const d = room(r.x, r.y, dy); if (d >= 5 && flat(r.x, r.y, dy, d) && (!best || d > best[1])) best = [key, d]; }
        if (!best && M.on()) {   // ちかくの めいろの 道の マスを さがす
          const K = M.K, a = Math.floor(r.x / K), b = Math.floor(r.y / K);
          outer: for (let rr = 1; rr <= 14; rr++) for (let y = b - rr; y <= b + rr; y++) for (let x = a - rr; x <= a + rr; x++) {
            if (Math.max(Math.abs(x - a), Math.abs(y - b)) !== rr || M.type(x, y) !== 1 || M.spot(x, y)) continue;
            const sx = (x + 0.5) * K, sy = (y + 0.5) * K;
            for (const [key, dy] of [['ArrowDown', 1], ['ArrowUp', -1]]) { const d = room(sx, sy, dy); if (d >= 5 && flat(sx, sy, dy, d)) { best = [key, d]; P.rollPut(sx, sy); moved = true; break outer; } }
          }
        }
        if (!best) for (const [key, dy] of [['ArrowDown', 1], ['ArrowUp', -1]]) { const d = room(r.x, r.y, dy); if (!best || d > best[1]) best = [key, d]; }   // 見つからなければ いまの 場所で
        if (moved) await new Promise(res => setTimeout(res, 400));
        return { best, style, moved, p0: P.roll.pitch, s0: P.roll.spin };
      });
      if (/^くるくる/.test(info.style) || info.best[1] < 2) { await page.evaluate(() => nishioPixel.setRoll(false)); return { ok: true, skipped: info.best[1] < 2 ? 'no-room' : info.style, room: info.best[1] }; }
      await uncover(page);   // めいろでは 窓（ごほうび・イベント・人の 話）が 出ている 間は 転がらないので、閉じてから
      const cov = await page.evaluate(() => nishioPixel.mapCovered() ? [...document.querySelectorAll('#pxInfo:not([hidden]), .panel:not([hidden]), [role="dialog"]:not([hidden])')].map(e => e.id || e.className).join(',') || 'reward' : '');   // 落ちたときに 分かるように
      await page.keyboard.down(info.best[0]);
      let pmax = 0, smax = 0;
      for (let i = 0; i < 25 && !(i >= 9 && pmax > 1.2); i++) { await page.waitForTimeout(100); const r = await page.evaluate(() => nishioPixel.roll); pmax = Math.max(pmax, Math.abs(r.pitch - info.p0)); smax = Math.max(smax, Math.abs(r.spin - info.s0)); }   // 遅い 画面でも 待てるよう、回りきるまで（2.5秒まで）押す
      await page.keyboard.up(info.best[0]);
      const upright = p => Math.abs(p / (Math.PI * 2) - Math.round(p / (Math.PI * 2))) < 0.02;   // 止まると 起きあがって こっちを向く
      let end = null, upS = 0; const trace = [];
      for (let i = 0; i < 30; i++) { await page.waitForTimeout(150); end = await page.evaluate(() => nishioPixel.roll); trace.push([+(end.pitch / (Math.PI * 2)).toFixed(2), +Math.hypot(end.vx, end.vy).toFixed(2)]); upS = (i + 1) * 0.15; if (upright(end.pitch) && Math.hypot(end.vx, end.vy) < 0.05) break; }   // 遅い 画面でも 待てるよう 4.5秒まで
      await page.evaluate(() => nishioPixel.setRoll(false));
      const up = upright(end.pitch);
      return { key: info.best[0], room: info.best[1], moved: info.moved, style: info.style, pitch: +pmax.toFixed(2), spin: +smax.toFixed(2), up, upS: +upS.toFixed(2), endPitch: +end.pitch.toFixed(2), endV: +Math.hypot(end.vx, end.vy).toFixed(3), kind: end.kind, slope: end.slope, at: [+end.x.toFixed(2), +end.y.toFixed(2)], trace: up ? undefined : trace, cov, ok: pmax > 1 && smax < 0.3 && up };
    } finally { R.errors.push(...v.errors); await v.ctx.close(); }
  })();
  // 曲がり角アシスト（めいろ）：右へ 開いた 曲がり角で、通路の まん中から 横に ずれて いても、上へ 傾けると 上の 通路に 入れる（アシストで 曲がれなく なっていないか）
  R.checks.cornerAssist = await (async () => {
    await page.evaluate(() => nishioPixel.setRoll(true)); await page.waitForTimeout(500);
    const c = await page.evaluate(() => { const M = nishioPixel.maze, r = nishioPixel.roll, K = M.K, a = Math.floor(r.x / K), b = Math.floor(r.y / K);
      for (let y = b - 8; y <= b + 8; y++) for (let x = a - 8; x <= a + 8; x++) if (M.type(x, y) === 1 && M.type(x + 1, y) === 1 && M.type(x, y - 1) === 1 && M.open(x, y, 1, 0) && M.open(x, y, 0, -1) && !M.spot(x, y)) return { x, y, K };
      return null; });
    if (!c) { await page.evaluate(() => nishioPixel.setRoll(false)); return { ok: true, skipped: 'no-corner' }; }
    await uncover(page); const env = await rollEnv(page); await traceOn(page);
    await page.evaluate(([x, y]) => nishioPixel.rollPut(x, y, 0, 0), [(c.x + 0.5) * c.K + 0.7, c.y * c.K + 1.4]);   // 横に 0.7マス ずれた 所（まっすぐ 上へ 行くと 生け垣の かどに 当たる）
    await page.waitForTimeout(150);
    await page.keyboard.down('ArrowUp');
    let entered = false;
    for (let i = 0; i < 16 && !entered; i++) { await page.waitForTimeout(100); entered = await page.evaluate(([x, y, K]) => { const r = nishioPixel.roll; return Math.floor(r.y / K) === y - 1 && Math.floor(r.x / K) === x; }, [c.x, c.y, c.K]); }
    await page.keyboard.up('ArrowUp');
    // ななめ（上と右を いっしょに）でも、2つの 寄せが 打ち消しあって マスから 出られなく ならない
    await page.evaluate(([x, y]) => nishioPixel.rollPut(x, y, 0, 0), [(c.x + 0.5) * c.K, c.y * c.K + 1.4]);
    await page.waitForTimeout(150);
    await page.keyboard.down('ArrowUp'); await page.keyboard.down('ArrowRight');
    let diag = false;   // 遅い 端末（テストの 画面が 重い とき）でも 待てるよう、3秒まで 見る
    for (let i = 0; i < 20 && !diag; i++) { await page.waitForTimeout(150); diag = await page.evaluate(([x, y, K]) => { const r = nishioPixel.roll; return Math.floor(r.x / K) !== x || Math.floor(r.y / K) !== y; }, [c.x, c.y, c.K]); }
    await page.keyboard.up('ArrowUp'); await page.keyboard.up('ArrowRight');
    const tr = await traceOff(page);
    await page.evaluate(() => nishioPixel.setRoll(false));
    return { ok: entered && diag, cell: [c.x, c.y], entered, diag, ...(entered && diag ? {} : { env, tr }) };
  })();
  // 田んぼや 草地の すずめ（運営者の声「西尾の素朴なかわいさを随所に散りばめて」）：お米が 転がって 近づくと、群れ みんなで とびたって 消える。見る だけ（ポイントは かわらない）
  R.checks.suzume = await (async () => {
    await page.evaluate(() => nishioPixel.setRoll(true)); await page.waitForTimeout(400);
    const r = await page.evaluate(async () => {
      const P = nishioPixel, S = P.suzume, r0 = P.roll, wait = ms => new Promise(res => setTimeout(res, ms)), p0 = nishioGo.state.points;
      S.put(Math.floor(r0.x) + 3, Math.floor(r0.y));
      const n = S.list.length, still = S.list.every(b => !b.fly);
      const b = S.list[0]; P.rollPut(b.x - 1.4, b.y, 3, 0);   // すずめの 1.4マス 手前から 3マス/秒で
      let all = false; for (let i = 0; i < 15 && !all; i++) { await wait(60); all = S.list.length > 0 && S.list.every(x => x.fly); }
      let gone = false; for (let i = 0; i < 30 && !gone; i++) { await wait(100); gone = S.list.length === 0; }
      S.clear(); P.rollPut(r0.x, r0.y, 0, 0);
      return { n, still, all, gone, pts: nishioGo.state.points - p0 };
    });
    await page.evaluate(() => nishioPixel.setRoll(false));
    return { ...r, ok: r.n >= 2 && r.n <= 3 && r.still && r.all && r.gone };   // pts：転がる とちゅうで ごはんつぶを ひろうと ふえる ので 見るだけ（すずめは ポイントに さわらない）
  })();
  // ねむって いる お米の そばに すずめが おりて くる（18秒 じっと して いたら）。お米が じっと して いる 間は いっしょに いて、動き だすと とびたつ
  R.checks.suzumeVisit = await (async () => {
    await page.evaluate(() => nishioPixel.setRoll(true)); await page.waitForTimeout(400);
    const r = await page.evaluate(async () => {
      const P = nishioPixel, S = P.suzume, r0 = P.roll, wait = ms => new Promise(res => setTimeout(res, ms));
      P.rollPut(r0.x, r0.y, 0, 0); await wait(300);
      S.visit(); await wait(600);
      const L = S.list, near = L.length >= 1 && L.length <= 2 && L.every(b => Math.hypot(b.x - P.roll.x, b.y - P.roll.y) < 2.6);
      await wait(1500);
      const stay = S.list.length === L.length && S.list.every(b => !b.fly);   // お米が じっと して いる 間は とびたたない
      const b = S.list[0]; P.rollPut(b.x - Math.sign(b.x - P.roll.x || 1) * 1, b.y, Math.sign(b.x - P.roll.x || 1) * 3, 0);
      let fly = false; for (let i = 0; i < 15 && !fly; i++) { await wait(60); fly = S.list.length > 0 && S.list.every(x => x.fly); }
      S.clear(); P.rollPut(r0.x, r0.y, 0, 0);
      return { n: L.length, near, stay, fly, after: S.VISIT };
    });
    await page.evaluate(() => nishioPixel.setRoll(false));
    return { ...r, ok: r.near && r.stay && r.fly && r.after >= 15 };
  })();
  // 道ばたで ひるねする ねこ（運営者の声「文字は減らして素朴なかわいさと平和さを散りばめる」）：ねて いて、お米が 近くを 転がると おきて、しばらく したら また ねる。文字は 出さない
  R.checks.neko = await (async () => {
    await page.evaluate(() => nishioPixel.setRoll(true)); await page.waitForTimeout(400);
    const r = await page.evaluate(async () => {
      const P = nishioPixel, N = P.neko, r0 = P.roll, wait = ms => new Promise(res => setTimeout(res, ms)), p0 = nishioGo.state.points, t0 = document.getElementById('toast').textContent;
      P.suzume.clear(); N.put(Math.floor(r0.x) + 3, Math.floor(r0.y));
      await wait(200);
      const asleep = !!N.cat && !N.cat.awake;
      P.rollPut(N.cat.x - 1.6, N.cat.y, 2.5, 0);   // ねこの 1.6マス 手前から
      let woke = false; for (let i = 0; i < 15 && !woke; i++) { await wait(60); woke = !!N.cat && N.cat.awake; }
      P.rollPut(r0.x, r0.y, 0, 0);
      let back = false; for (let i = 0; i < 40 && !back; i++) { await wait(100); back = !!N.cat && !N.cat.awake; }
      const toast = document.getElementById('toast').textContent !== t0 && /ねこ|にゃ/.test(document.getElementById('toast').textContent);
      N.clear();
      return { asleep, woke, back, toast, pts: nishioGo.state.points - p0 };
    });
    await page.evaluate(() => nishioPixel.setRoll(false));
    return { ...r, ok: r.asleep && r.woke && r.back && !r.toast };   // pts は 見るだけ（転がる とちゅうの ごはんつぶで ふえる ことが ある）
  })();
  // 田んぼの あぜの カエル（運営者の声「文字は減らして素朴なかわいさと平和さを散りばめる」）：4〜10月。すわって いて、お米が 近くを 転がると 田んぼへ とびこんで 消える。文字は 出さない
  R.checks.kaeru = await (async () => {
    await page.evaluate(() => nishioPixel.setRoll(true)); await page.waitForTimeout(400);
    const r = await page.evaluate(async () => {
      const P = nishioPixel, K = P.kaeru, r0 = P.roll, wait = ms => new Promise(res => setTimeout(res, ms)), t0 = document.getElementById('toast').textContent;
      const shut = () => { document.querySelectorAll('.medashi').forEach(e => { e.hidden = true; }); document.getElementById('pxInfo').hidden = true; const rw = document.getElementById('reward'); if (rw.classList.contains('show')) rw.click(); };
      const season = K.season();
      P.suzume.clear(); P.neko.clear(); P.mushi.clear(); K.put(Math.floor(r0.x) + 2, Math.floor(r0.y) - 1);
      await wait(500);
      const sit = K.list.length === 1 && !K.list[0].jump;
      let jump = false; for (let i = 0; i < 15 && !jump; i++) { shut(); const f = K.list[0]; if (!f) break; P.rollPut(f.x - 1, f.y, 3, 0); await wait(60); jump = !!K.list[0] && K.list[0].jump; }
      let gone = false; for (let i = 0; i < 20 && !gone; i++) { await wait(100); gone = K.list.length === 0; }
      P.rollPut(r0.x, r0.y, 0, 0);
      const toast = document.getElementById('toast').textContent !== t0 && /カエル|かえる/.test(document.getElementById('toast').textContent);
      K.clear();
      return { season, sit, jump, gone, toast };
    });
    await page.evaluate(() => nishioPixel.setRoll(false));
    return { ...r, ok: r.season && r.sit && r.jump && r.gone && !r.toast };
  })();
  // 季節の 小さな 虫（運営者の声「文字は減らして素朴なかわいさと平和さを散りばめる」）：10月は 赤とんぼ。お米の まわりを とび、近くを 転がると はなれて 消える。文字は 出さない
  R.checks.kisetsuMushi = await (async () => {   // 名前は「虫の名前あて」の mushi と 分ける
    await page.evaluate(() => nishioPixel.setRoll(true)); await page.waitForTimeout(400);
    const r = await page.evaluate(async () => {
      const P = nishioPixel, U = P.mushi, r0 = P.roll, wait = ms => new Promise(res => setTimeout(res, ms)), p0 = nishioGo.state.points, t0 = document.getElementById('toast').textContent;
      const kind = U.kind();
      P.suzume.clear(); P.neko.clear(); U.put(r0.x + 2.5, r0.y - 1);
      await wait(800);
      const flying = !!U.m && !U.m.flee, moved = !!U.m && Math.hypot(U.m.x - r0.x - 2.5, U.m.y - r0.y + 1) > 0.05;   // ふらふら 動く
      // とんぼは とび まわるので、毎回 いまの 所の すぐ 手前に 置きなおして 転がす（1回 置く だけ では、生け垣で 止まったり とんぼが はなれたり して 近づけない ことが あった）
      const shut = () => { document.querySelectorAll('.medashi').forEach(e => { e.hidden = true; }); document.getElementById('pxInfo').hidden = true; const rw = document.getElementById('reward'); if (rw.classList.contains('show')) rw.click(); };   // 窓が 出て いる 間は お米が 止まる（ごはんつぶを ひろうと ごほうびが 出る ことが ある）
      let flee = false; for (let i = 0; i < 15 && !flee; i++) { shut(); const m = U.m; if (!m) break; P.rollPut(m.x - 0.8, m.y, 3, 0); await wait(60); flee = !!U.m && U.m.flee; }
      let gone = false; for (let i = 0; i < 30 && !gone; i++) { await wait(100); gone = !U.m; }
      P.rollPut(r0.x, r0.y, 0, 0);
      const toast = document.getElementById('toast').textContent !== t0 && /とんぼ|ちょう/.test(document.getElementById('toast').textContent);
      U.clear();
      return { kind, flying, moved, flee, gone, toast, pts: nishioGo.state.points - p0 };
    });
    await page.evaluate(() => nishioPixel.setRoll(false));
    return { ...r, ok: r.kind === 'tonbo' && r.flying && r.moved && r.flee && r.gone && !r.toast };   // pts は 見るだけ
  })();
  // ゆるい めいろ（2026-10-26 店主「直角ではなく ゆるい構造に」）：通路は 道すじの 筒。次の マスの 向きだけ 押して 転がすと、
  // 筒から はみ出さずに（道すじから 0.45マス＋やわらかい 生け垣が のびる 0.4マス以内）、ゴールまでの めいろの 道のりが へる（まるい 角で 止まらない）
  R.checks.yuruMeiro = await (async () => {
    await page.evaluate(() => nishioPixel.setRoll(true)); await page.waitForTimeout(500);
    const r = await page.evaluate(async () => {
      const P = nishioPixel, sleep = ms => new Promise(f => setTimeout(f, ms));
      if (!P.maze.on() || !P.maze.near) return { skipped: 'no-maze' };
      const r0 = P.maze.routePath();
      if (!r0 || r0.length < 6) return { skipped: 'no-route' };
      const keys = {}, set = (k, on) => { if (!!keys[k] === !!on) return; keys[k] = on; document.body.dispatchEvent(new KeyboardEvent(on ? 'keydown' : 'keyup', { key: k, bubbles: true })); };
      let maxD = 0, best = r0.length;
      for (let t = 0; t < 8000; t += 40) {
        const route = P.maze.routePath();
        if (!route || route.length < 3) { best = 0; break; }
        const dx = route[1][0] - route[0][0], dy = route[1][1] - route[0][1];
        set('ArrowRight', dx > 0); set('ArrowLeft', dx < 0); set('ArrowDown', dy > 0); set('ArrowUp', dy < 0);
        await sleep(40);
        const q = P.maze.near(P.roll.x, P.roll.y);
        if (q) maxD = Math.max(maxD, q.d);
        best = Math.min(best, route.length);
      }
      for (const k of ['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp']) set(k, false);
      return { len0: r0.length, best, maxD: +maxD.toFixed(2), covered: P.mapCovered(true) };
    });
    await page.evaluate(() => nishioPixel.setRoll(false));
    return { ...r, ok: !!r.skipped || (r.maxD <= 0.9 && (r.best <= r.len0 - 3 || r.covered)) };   // やわらかい 生け垣：筒の ふち（0.45）から 0.4マスまで のびる   // 窓が 出て 止まった ときは 進めなくても よい
  })();
  // やわらかい 生け垣（2026-10-26 店主「迷路の壁は柔らかく、当たると伸びて跳ね返る」）：左だけ 開いた 行き止まりへ 右向きに 当てると、
  // 生け垣が のびて（めりこみ 0〜0.41マス）はね返り（2割以上）、へこみの 奥で 固まらない（めりこんだ まま 止まらない）
  R.checks.yuruSoft = await (async () => {
    await page.evaluate(() => nishioPixel.setRoll(true)); await page.waitForTimeout(400);
    await uncover(page);   // 窓が 出ている 間は 転がらないので 閉じてから
    const r = await page.evaluate(async () => {
      const P = nishioPixel, M = P.maze, sleep = ms => new Promise(f => setTimeout(f, ms));
      if (!M.on() || !M.soft) return { skipped: 'no-maze' };
      const K = M.K, cx = Math.floor(P.roll.x / K), cy = Math.floor(P.roll.y / K);
      let c = null;
      for (let d = 0; d < 15 && !c; d++) for (let y = cy - d; y <= cy + d && !c; y++) for (let x = cx - d; x <= cx + d && !c; x++) if (M.type(x, y) === 1 && M.open(x, y, -1, 0) && !M.open(x, y, 1, 0) && !M.open(x, y, 0, 1) && !M.open(x, y, 0, -1)) c = { x, y };
      if (!c) return { skipped: 'no-deadend' };
      const out = [];
      const stopped = () => P.mapCovered(true) || P.sightBusy() || !!document.querySelector('.medashi:not([hidden])');   // お米が 止められて いる（窓・人の 話・できごと）
      const clear = async () => { for (let i = 0; i < 20 && stopped(); i++) { const w = document.getElementById('reward'); if (w.classList.contains('show')) w.click(); document.querySelectorAll('#pxInfo:not([hidden]) [data-close], .medashi:not([hidden]) .md-close').forEach(b => b.click()); await sleep(150); } };
      for (const v of [5, 8]) for (let tries = 0; tries < 3; tries++) {   // 当てて いる 間に 窓が 出て 止められたら、閉じて 置きなおす（3回まで。止められると 当たらずに pen 0 で 落ちた）
        await clear();
        P.rollPut(c.x * K + 0.6, c.y * K + 1.5, v, 0);
        let pen = 0, back = 0, dent = 0, show = 0, prev = null, busy = 0, why = '';
        const b0 = M.soft().boings || 0, tEnd = performance.now() + 1000;
        while (performance.now() < tEnd) {   // 描く こまごとに 見る。show：へこみの 絵が 0.12マスより 深い 時間（目に 見える 間）。こまの 間は、その はじめの こまの ようすで 数える（遅い 画面で、見る 前の 待ち時間を いまの ようすに 数えない。Codex の 指摘）
          await new Promise(f => requestAnimationFrame(f));
          const s = M.soft(), t2 = performance.now();
          if (s.on) pen = Math.max(pen, s.pen); back = Math.min(back, P.roll.vx); dent = Math.max(dent, s.dent);
          if (prev && prev.vis) show += t2 - prev.t;
          prev = { t: t2, vis: s.dent > 0.12 };
          if (stopped()) { busy++; why = why || (document.getElementById('reward').classList.contains('show') ? 'reward:' + document.getElementById('reward').innerText.replace(/\s+/g, ' ').slice(0, 30) : !document.getElementById('pxInfo').hidden ? 'pxInfo' : P.sightBusy() ? 'sight' : 'other'); }
        }
        // お米が 止まって、へこみの ゆれも おさまった ままが 0.3秒 つづくまで（4秒まで）。小さな ゆれは 当ててから 2.2秒ほど のこり、はね返って となりの マスの 生け垣に また 当たると 3秒ほど。
        //   決めうちの 1.2秒 待ちでは ときどき まだ ゆれて いた。ゆれが 0 に なった とたんに 見ると、2回目に 当たる 前の 一瞬で ぬけて しまう
        for (let t = 0, calm = 0; t < 4000 && calm < 300; t += 50) { await sleep(50); calm = M.soft().dv === 0 && Math.hypot(P.roll.vx, P.roll.vy) < 0.05 ? calm + 50 : 0; }
        if (busy && tries < 2) continue;
        out.push({ v, tries, busy, ...(busy ? { why } : {}), pen: +pen.toFixed(3), e: +(-back / v).toFixed(2), dent: +dent.toFixed(2), show: Math.round(show), boing: (M.soft().boings || 0) - b0, settled: M.soft().dv === 0, stuck: !!(M.soft().on && Math.hypot(P.roll.vx, P.roll.vy) < 0.05), same: Math.floor(P.roll.x / K) <= c.x });   // 右の さかいを 通りぬけていない（はね返って 左へ 出るのは よい）
        break;
      }
      return { cell: [c.x, c.y], out };
    });
    await page.evaluate(() => nishioPixel.setRoll(false));
    return { ...r, ok: !!r.skipped || (r.out.every(o => o.pen > 0 && o.pen <= 0.41 && o.e >= 0.2 && !o.stuck && o.same && o.boing >= 1 && o.settled) && r.out[r.out.length - 1].show >= 200) };   // のびた へこみが 0.2秒 以上 見え（これまでは 0.1秒 たらずで もどり、お米の 絵に かくれて 見えなかった）、はなれると ぽよん
  })();
  // ばねの わざ（2026-10-27 店主「迷路の壁が伸びて跳ね返って加速するスキル」）：ばねを とると 12秒、生け垣から はなれる ときに 当たった 速さより 速く（1.3倍）はね返る。
  // ふだんは 当たった 速さより おそく はね返る（4割ほど）。わざの 時間が すぎたら もとに もどる
  R.checks.yuruSpring = await (async () => {
    await page.evaluate(() => nishioPixel.setRoll(true)); await page.waitForTimeout(400);
    await uncover(page);   // 窓が 出ている 間は 転がらないので 閉じてから
    const r = await page.evaluate(async () => {
      const P = nishioPixel, M = P.maze, sleep = ms => new Promise(f => setTimeout(f, ms));
      if (!M.on() || !M.spring) return { skipped: 'no-maze' };
      const K = M.K, cx = Math.floor(P.roll.x / K), cy = Math.floor(P.roll.y / K);
      let c = null;
      for (let d = 0; d < 15 && !c; d++) for (let y = cy - d; y <= cy + d && !c; y++) for (let x = cx - d; x <= cx + d && !c; x++) if (M.type(x, y) === 1 && M.open(x, y, -1, 0) && !M.open(x, y, 1, 0) && !M.open(x, y, 0, 1) && !M.open(x, y, 0, -1)) c = { x, y };
      if (!c) return { skipped: 'no-deadend' };
      const stopped = () => P.mapCovered(true) || P.sightBusy() || !!document.querySelector('.medashi:not([hidden])');   // お米が 止められて いる（窓・人の 話・できごと）
      const clear = async () => { for (let i = 0; i < 20 && stopped(); i++) { const w = document.getElementById('reward'); if (w.classList.contains('show')) w.click(); document.querySelectorAll('#pxInfo:not([hidden]) [data-close], .medashi:not([hidden]) .md-close').forEach(b => b.click()); await sleep(150); } };
      const hitAt = async v => {   // 当てて、当たった 速さ（vin）と もどる 速さ（back）。当てて いる 間に 窓が 出て 止められたら、閉じて 当てなおす（3回まで。止められると vin 0 で 落ちた）
        let res = null;
        for (let tries = 0; tries < 3; tries++) {
          await clear();
          P.rollPut(c.x * K + 0.6, c.y * K + 1.5, v, 0);
          let vin = 0, back = 0, why = ''; const t0 = performance.now();
          while (performance.now() - t0 < 900) { await new Promise(f => requestAnimationFrame(f)); vin = Math.max(vin, M.soft().vin || 0); back = Math.min(back, P.roll.vx); if (!why && stopped()) why = document.getElementById('reward').classList.contains('show') ? 'reward:' + document.getElementById('reward').innerText.replace(/\s+/g, ' ').slice(0, 30) : !document.getElementById('pxInfo').hidden ? 'pxInfo' : P.sightBusy() ? 'sight' : 'other'; }
          P.rollPut(c.x * K + 0.6, c.y * K + 1.5, 0, 0); await sleep(300);
          res = { vin: +vin.toFixed(2), back: +(-back).toFixed(2), ...(why ? { why, tries } : {}) };
          if (!why) break;
        }
        return res;
      };
      M.springOn(0); const off = await hitAt(6);
      const g0 = M.spring().got; M.springPut(c.x, c.y); await sleep(300);   // ばねを お米の いる マスに 置く → とる
      const took = { got: M.spring().got - g0, left: Math.round(M.spring().left / 1000) };
      const b0 = M.spring().boosts, on = await hitAt(6), boosts = M.spring().boosts - b0;
      M.springOn(200); await sleep(400); const after = await hitAt(6);   // 時間が すぎた
      return { cell: [c.x, c.y], off, took, on, boosts, after };
    });
    await page.evaluate(() => nishioPixel.setRoll(false));
    return { ...r, ok: !!r.skipped || (r.took.got === 1 && r.took.left >= 10 && r.off.back < r.off.vin && r.on.back > r.on.vin * 1.1 && r.on.back <= 8.05 && r.boosts >= 1 && r.after.back < r.after.vin) };
  })();
  // ころころコンボ（クセになる 転がり方）：かべに 当たらずに 転がりつづけると コトンの たびに 数が ふえ、当たるか 止まると 0 に もどる
  R.checks.rollCombo = await (async () => {
    await page.evaluate(() => nishioPixel.setRoll(true)); await page.waitForTimeout(400); await uncover(page);
    const pick = await page.evaluate(() => { const r = nishioPixel.roll; let best = null; for (const [k, dx, dy] of [['ArrowLeft', -1, 0], ['ArrowRight', 1, 0], ['ArrowUp', 0, -1], ['ArrowDown', 0, 1]]) { let d = 1; while (d < 30 && !nishioPixel.rollBlockedFrom(r.x + dx * (d - 1), r.y + dy * (d - 1), r.x + dx * d, r.y + dy * d)) d++; if (!best || d > best[1]) best = [k, d]; } return best; });
    if (pick[1] < 5) { await page.evaluate(() => nishioPixel.setRoll(false)); return { ok: true, skipped: 'no-room', d: pick[1] }; }
    const p0 = await page.evaluate(() => [nishioPixel.roll.x, nishioPixel.roll.y]);
    await page.keyboard.down(pick[0]);
    let max = 0;
    for (let i = 0; i < 30; i++) { await page.waitForTimeout(100); max = Math.max(max, await page.evaluate(() => nishioPixel.combo.n)); }
    await page.keyboard.up(pick[0]);
    // かべに 当たるか、止まって 0.7秒で おしまい。ゆるい めいろでは 曲がり角も カーブに そって すべるので（当たらないので コンボは つづく）、止まるまで 待つ（5秒まで）
    // 止まって 0.7秒で コンボは おしまい（0 に もどる）。坂（本当の 高低差）や ゆるい カーブでは、止まった あと また 転がりだして 新しい コンボが はじまる ことが ある
    // （ときどき 落ちていた：おわった あと 坂で ×2 から やりなおし、さいごの 1回だけ 見ると 0 で なかった）。なので 6秒の 間に いちど でも 0 に もどったかを 見る
    let ended = false, after = null;
    for (let i = 0; i < 30 && !ended; i++) { await page.waitForTimeout(200); after = await page.evaluate(() => nishioPixel.combo); ended = after.n === 0; }
    await page.evaluate(p0 => { nishioPixel.rollPut(p0[0], p0[1]); nishioPixel.setRoll(false); }, p0);   // はじめの 場所に もどして 止める（坂で 転がり つづけて、あとの comboBest の コンボに まざらない ように）
    return { ok: max >= 2 && ended && (max < 5 || after.best >= max), key: pick[0], room: pick[1], max, after, ended };
  })();
  // ころころコンボの ベスト：転がっている うちに ベストを こえると その場で「🏅 ベスト こえた！」、止まると ベストが のこる
  R.checks.comboBest = await (async () => {
    const w0 = await page.evaluate(() => { const d = nishioGo.state.day || (nishioGo.state.day = {}), w = d.watch; d.watch = 2; return w === undefined ? null : w; });   // 止まって 待つ 間に、水べの「じっと見る」が 起きない ように（あとの waterWatch・critterSure が ずれる）
    await page.evaluate(() => nishioPixel.setRoll(true)); await page.waitForTimeout(300);
    const old = await page.evaluate(() => nishioPixel.combo.best);
    const mid = await page.evaluate(() => { nishioPixel.comboBest(5); nishioPixel.comboAdd(6); return { c: nishioPixel.combo, f: nishioPixel.floats() }; });
    let end = null;
    for (let i = 0; i < 20 && !(end && end.n === 0); i++) { await page.waitForTimeout(150); end = await page.evaluate(() => nishioPixel.combo); }   // 止まって 0.7秒で おしまい
    // あと 少しで ベスト（ベスト 10 に 8）：おわった ときに「おしい！ あと3」
    await page.evaluate(() => { nishioPixel.comboBest(10); nishioPixel.comboAdd(8); });
    let near = false;
    for (let i = 0; i < 20 && !near; i++) { await page.waitForTimeout(150); near = await page.evaluate(() => nishioPixel.floats().some(t => t === 'おしい！ あと3')); }   // 文字は みじかく（「ベストまで … だったじゃん」は 長かった）
    // 同じ ベストに 同じ 近さ（8）では もう 出さない・前より 近づくと（9）また 出す（めいろで 迷う 間、2分で 7回「あと4」が 出た）
    const oshii = () => page.evaluate(() => nishioPixel.floats().filter(t => /おしい！/.test(t)));
    for (let i = 0; i < 40 && (await oshii()).length; i++) await page.waitForTimeout(150);   // 前の 文字が 消えるまで
    await page.evaluate(() => nishioPixel.comboAdd(8));
    let again = false;
    for (let i = 0; i < 20 && !again; i++) { await page.waitForTimeout(150); again = (await oshii()).length > 0; }
    await page.evaluate(() => nishioPixel.comboAdd(9));
    let closer = false;
    for (let i = 0; i < 20 && !closer; i++) { await page.waitForTimeout(150); closer = (await oshii()).some(t => /あと2/.test(t)); }
    // とても 近い（あと1〜3）ときだけ：ベスト 10 に 7（あと4）では 出さない（200秒で 5回 出て うるさかった）
    for (let i = 0; i < 40 && (await oshii()).length; i++) await page.waitForTimeout(150);
    await page.evaluate(() => { nishioPixel.comboBest(10); nishioPixel.comboAdd(7); });
    let far = false;
    for (let i = 0; i < 14 && !far; i++) { await page.waitForTimeout(150); far = (await oshii()).length > 0; }
    await page.evaluate(o => { nishioPixel.comboBest(o); try { localStorage.setItem('nsg_combo_best', String(o)); } catch (e) { /* noop */ } nishioPixel.setRoll(false); }, old);
    await page.evaluate(w => { const d = nishioGo.state.day || {}; if (w === null) delete d.watch; else d.watch = w; }, w0);
    const told = mid.f.some(t => t === '🏅 ベスト こえたじゃん！');   // 数は 横の「×6」に 出て いるので 書かない（同じ 数を 2か所に 書かない）
    return { ok: mid.c.beat && told && end.n === 0 && end.best === 6 && !end.beat && near && !again && closer && !far, beat: mid.c.beat, told, end, near, again, closer, far };
  })();
  // ころころコンボで ベストを こえた 数の まま おわった ときは、「ベスト こえたじゃん！」（×6）と「あたらしい ベスト ×6」を つづけて 出さない（自分で 遊んで 分かった：同じ ×9 が 0.1秒 ちがいで 2回）。
  // こえた あとも のびて おわった ときは、おわりに のびた 数を 出す
  R.checks.comboBestOnce = await (async () => {
    const w0 = await page.evaluate(() => { const d = nishioGo.state.day || (nishioGo.state.day = {}), w = d.watch; d.watch = 2; return w === undefined ? null : w; });
    await page.evaluate(() => nishioPixel.setRoll(true)); await page.waitForTimeout(300);
    const old = await page.evaluate(() => nishioPixel.combo.best);
    const run = async adds => {   // コンボを 足して おわるまで、出た 浮かぶ 文字を ぜんぶ 集める
      await page.evaluate(a => { const P = nishioPixel; P.floatsClear(); P.comboBest(5); window.__fl = new Set(); for (const k of a) P.comboAdd(k); }, adds);
      let end = null;
      for (let i = 0; i < 30 && !(end && end.n === 0); i++) { await page.waitForTimeout(100); end = await page.evaluate(() => { nishioPixel.floats().forEach(t => window.__fl.add(t)); return nishioPixel.combo; }); }
      await page.waitForTimeout(200);
      return page.evaluate(() => { nishioPixel.floats().forEach(t => window.__fl.add(t)); return [...window.__fl].filter(t => /ベスト/.test(t) && !/おしい/.test(t)); });
    };
    const same = await run([6]);   // ×6 で こえて ×6 で おわる
    for (let i = 0; i < 40 && (await page.evaluate(() => nishioPixel.floats().length)); i++) await page.waitForTimeout(150);
    const grew = await run([6, 2]);   // ×6 で こえて ×8 まで のびて おわる
    await page.evaluate(o => { nishioPixel.floatsClear(); nishioPixel.comboBest(o); try { localStorage.setItem('nsg_combo_best', String(o)); } catch (e) { /* noop */ } nishioPixel.setRoll(false); }, old);
    await page.evaluate(w => { const d = nishioGo.state.day || {}; if (w === null) delete d.watch; else d.watch = w; }, w0);
    return { same, grew, ok: same.length === 1 && /こえた/.test(same[0]) && grew.length === 2 && grew.some(t => /あたらしい ベスト ×8/.test(t)) };
  })();
  // コンボの 数の 下の ベストの 札は「🏅9」・こえたら「🏅」だけ（「ベスト 9」「ベスト こうしん中」と 文字で 書かない。こえた ことは 浮かぶ 文字が 言う。運営者の声「文字は 少なく」）
  R.checks.comboTag = await (async () => {
    const w0 = await page.evaluate(() => { const d = nishioGo.state.day || (nishioGo.state.day = {}), w = d.watch; d.watch = 2; return w === undefined ? null : w; });
    await page.evaluate(() => nishioPixel.setRoll(true)); await page.waitForTimeout(300);
    const old = await page.evaluate(() => nishioPixel.combo.best);
    const tags = async (best, n) => {   // コンボを 足して、描いた 文字を 0.4秒 集める
      await page.evaluate(([b, k]) => { const P = nishioPixel, C = CanvasRenderingContext2D.prototype; P.floatsClear(); P.comboBest(b); window.__ft = new Set(); window.__keepFt = window.__keepFt || C.fillText; C.fillText = function (t, ...a) { window.__ft.add(String(t)); return window.__keepFt.call(this, t, ...a); }; P.comboAdd(k); }, [best, n]);
      await page.waitForTimeout(400);
      const r = await page.evaluate(() => { CanvasRenderingContext2D.prototype.fillText = window.__keepFt; return [...window.__ft]; });
      for (let i = 0; i < 30 && (await page.evaluate(() => nishioPixel.combo.n)); i++) await page.waitForTimeout(100);   // おわるまで
      return r.filter(t => /^🏅\d*$|^ベスト (こうしん中|\d+)$/.test(t));
    };
    const under = await tags(20, 6), over = await tags(5, 6);
    await page.evaluate(o => { nishioPixel.floatsClear(); nishioPixel.comboBest(o); try { localStorage.setItem('nsg_combo_best', String(o)); } catch (e) { /* noop */ } nishioPixel.setRoll(false); }, old);
    await page.evaluate(w => { const d = nishioGo.state.day || {}; if (w === null) delete d.watch; else d.watch = w; }, w0);
    return { under, over, ok: under.length === 1 && under[0] === '🏅20' && over.length === 1 && over[0] === '🏅' };
  })();
  // スピード線：とても 速いと（1秒に 5マスより）お米の うしろに 線が 出て、おそく なると うすれて 消える
  R.checks.speedLines = await (async () => {
    await page.evaluate(() => { nishioPixel.setRoll(true); document.querySelectorAll('.medashi').forEach(e => { e.hidden = true; }); }); await page.waitForTimeout(300);
    const pick = await page.evaluate(() => { const r = nishioPixel.roll; let best = null; for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) { let d = 1; while (d < 14 && !nishioPixel.rollBlockedFrom(r.x + dx * (d - 1), r.y + dy * (d - 1), r.x + dx * d, r.y + dy * d)) d++; if (!best || d > best[2]) best = [dx, dy, d]; } return { best, x: r.x, y: r.y }; });
    const [dx, dy, d] = pick.best;
    if (d < 5) { await page.evaluate(() => nishioPixel.setRoll(false)); return { ok: true, skipped: 'no-room', d }; }
    await page.evaluate(a => nishioPixel.rollPut(...a), [pick.x, pick.y, dx * 7.5, dy * 7.5]);
    let fast = 0;
    for (let i = 0; i < 10 && fast < 0.3; i++) { await page.waitForTimeout(30); fast = Math.max(fast, await page.evaluate(() => nishioPixel.speedK)); }
    let slow = 1;
    for (let i = 0; i < 20 && slow >= 0.05; i++) { await page.waitForTimeout(150); slow = await page.evaluate(() => nishioPixel.speedK); }
    await page.evaluate(a => { nishioPixel.rollPut(a[0], a[1], 0, 0); nishioPixel.setRoll(false); }, [pick.x, pick.y]);
    return { ok: fast >= 0.3 && slow < 0.05, room: d, fast: +fast.toFixed(2), slow: +slow.toFixed(2) };
  })();
  // びゅんパネル（クセになる ギミック）：めいろの パネルの 上で 矢印の 向きに 傾けると びゅんと 速く なる。矢印と 逆から 来ても おされない（通れる）
  R.checks.mazePad = await (async () => {
    await page.evaluate(() => nishioPixel.setRoll(true)); await page.waitForTimeout(500);
    const c = await page.evaluate(() => { const r = nishioPixel.roll; return { pads: nishioPixel.maze.padsNear(14), K: nishioPixel.maze.K, home: [r.x, r.y] }; });
    if (!c.pads.length) { await page.evaluate(() => nishioPixel.setRoll(false)); return { ok: true, skipped: 'no-pad' }; }
    const [x, y, d] = c.pads[0], D = [[1, 0], [0, 1], [-1, 0], [0, -1]][d], key = ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp'][d], K = c.K;
    const put = (X, Y, vx, vy) => page.evaluate(a => { document.querySelectorAll('.medashi').forEach(e => { e.hidden = true; }); nishioPixel.rollPut(...a); }, [X, Y, vx, vy]);
    let h0, h1, vmax, tr, tries = 0;
    do {   // 傾けて いる 間に 窓（ごほうび・人の 話）が 出て 止められたら、閉じて 置きなおす（3回まで。止められると vmax 0 で 落ちた）
      await uncover(page);
      await put(c.home[0], c.home[1], 0, 0); await page.waitForTimeout(150);
      h0 = await page.evaluate(() => nishioPixel.maze.padHits);
      await put((x + 0.5) * K, y * K + 1.4, 0, 0); await page.waitForTimeout(100);   // パネルの 上で 止まって いて、矢印の 向きに 傾ける
      await traceOn(page);
      await page.keyboard.down(key);
      vmax = 0; h1 = h0;
      for (let i = 0; i < 30 && h1 === h0; i++) { await page.waitForTimeout(16); const r = await page.evaluate(() => { const r = nishioPixel.roll; return [Math.hypot(r.vx, r.vy), nishioPixel.maze.padHits]; }); vmax = Math.max(vmax, r[0]); h1 = r[1]; }
      const r1 = await page.evaluate(() => { const r = nishioPixel.roll; return Math.hypot(r.vx, r.vy); }); vmax = Math.max(vmax, r1);
      await page.keyboard.up(key);
      tr = await traceOff(page);
    } while (traceBusy(tr) && ++tries < 3);
    let chain = 'one-pad';   // 3.5秒 いないに 別の パネルに のると「びゅん×2」
    if (c.pads.length > 1) {
      const [x2, y2, d2] = c.pads[1], E = [[1, 0], [0, 1], [-1, 0], [0, -1]][d2];
      await put((x2 + 0.5) * K, y2 * K + 1.4, E[0] * 2, E[1] * 2);
      for (let i = 0; i < 20; i++) { await page.waitForTimeout(16); chain = await page.evaluate(() => nishioPixel.maze.padChain.n); if (chain >= 2) break; }
    }
    await put(c.home[0], c.home[1], 0, 0); await page.waitForTimeout(150);
    const h1b = await page.evaluate(() => nishioPixel.maze.padHits);
    await put((x + 0.5) * K + D[0] * 1.2, y * K + 1.4 + D[1] * 1.2, -D[0] * 2, -D[1] * 2);   // 逆から
    await page.waitForTimeout(400);
    const h2 = await page.evaluate(() => nishioPixel.maze.padHits);
    await put(c.home[0], c.home[1], 0, 0);
    await page.evaluate(() => nishioPixel.setRoll(false));
    const ok = h1 === h0 + 1 && vmax > 6 && h2 === h1b && (chain === 'one-pad' || chain === 2);
    return { ok, pad: [x, y, d], boosted: h1 - h0, vmax: +vmax.toFixed(1), against: h2 - h1b, chain, tries, ...(ok ? {} : { tr }) };
  })();
  // ごはんつぶの 列（癖になる ギミック）：通路に 並んだ つぶに ふれると ひろえて、列を ぜんぶ ひろうと「ぜんぶ ひろった！」
  R.checks.mazeDots = await (async () => {
    await page.evaluate(() => nishioPixel.setRoll(true)); await page.waitForTimeout(500);
    const c = await page.evaluate(() => { const r = nishioPixel.roll; return { home: [r.x, r.y], d0: nishioPixel.maze.dots, ls: nishioPixel.maze.linesNear().filter(L => L.left === L.dots.length).map(L => ({ dots: L.dots, dist: Math.hypot(L.dots[0][0] - r.x, L.dots[0][1] - r.y) })).sort((a, b) => a.dist - b.dist) }; });
    if (!c.ls.length) { await page.evaluate(() => nishioPixel.setRoll(false)); return { ok: true, skipped: 'no-line' }; }
    const L = c.ls[0], runOf = () => page.evaluate(() => { const g = nishioGo.guide, gl = g && nishioPixel.maze.goal(g.id || g.name); return gl && gl.run ? gl.run.dots : null; });   // ゴールの ふり返り（この 道で ひろった つぶ）
    const r0 = await runOf();
    for (const d of L.dots) { await page.evaluate(d => { document.querySelectorAll('.medashi').forEach(e => { e.hidden = true; }); nishioPixel.rollPut(d[0], d[1], 0, 0); }, d); await page.waitForTimeout(60); }
    const d1 = await page.evaluate(() => nishioPixel.maze.dots), r1 = await runOf();
    const tip = await page.evaluate(() => {   // 3回に 1回（1回目も）名物の ひと言。市町が わからない・西尾市の 外では 出さない
      const H = nishioPixel.here, c0 = H.city, out = { tip: nishioPixel.maze.meibutsuTip(), floats: nishioPixel.floats() };
      H.city = ''; out.none = nishioPixel.maze.meibutsuTip(); H.city = '蒲郡市'; out.out = nishioPixel.maze.meibutsuTip(); H.city = c0;
      return out;
    });
    await page.evaluate(h => { nishioPixel.rollPut(h[0], h[1], 0, 0); nishioPixel.setRoll(false); }, c.home);
    const run = r0 === null || r1 === null ? 'no-goal' : r1 - r0;
    const tipOk = (d1.lines % 3 !== 1 || !tip.tip || tip.floats.some(t => t.includes(tip.tip))) && !tip.none && !tip.out;
    return { ok: d1.n - c.d0.n >= L.dots.length && d1.lines === c.d0.lines + 1 && (run === 'no-goal' || run >= L.dots.length) && tipOk, len: L.dots.length, got: d1.n - c.d0.n, lines: d1.lines - c.d0.lines, run, tip: tip.tip, tipOk };
  })();
  // ゴールまでの めいろ図は なくした（運営者の声「ゴールまでの迷路は削除」2026-10-29）：図を 出す 入口が なく、図の 文字も 描かない。縁の 矢印の タップは せかいちず
  R.checks.noGoalMap = (() => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'nishio-go', 'pixel.js'), 'utf8');
    const left = ['ゴールまでの めいろ\'', 'function drawMzMap', 'function mzMapOpen', 'mzMapOpen('].filter(w => src.includes(w));
    return { left, ok: !left.length };
  })();
  R.checks.noGoalMapApi = await page.evaluate(() => { const M = nishioPixel.maze; return { map: typeof M.map, shown: 'mapShown' in M, ok: typeof M.map === 'undefined' && !('mapShown' in M) }; });
  // 特典の 100円引き：クーポンの 有効時間は 短め（10分）、条件「お米1袋につき1回まで」「LINE のクーポンとは併用できません」が 特典の 札と 店頭の クーポン画面に 出る（操作して移動の サンプルで ためす）
  // （札の 条件は「条件」を タップ しないと 見えなかった。タップ なしで いつも 見える ことも 見る）
  R.checks.coupon100 = await (async () => {
    const onDialog = d => d.accept();
    page.on('dialog', onDialog);
    const r = await page.evaluate(async () => {
      const G = nishioGo, S = G.state, wait = ms => new Promise(f => setTimeout(f, ms));
      if (!G.demo) return { skipped: 'walk' };
      const p0 = S.points, n0 = S.coupons.length, l0 = S.log.length;
      S.points += 600; G.openTab('rewards'); await wait(300);
      const li = [...document.querySelectorAll('#rewardList li')].find(l => /100円引き/.test(l.textContent));
      if (!li) { S.points = p0; G.openTab('map'); return { found: false }; }
      const chip = /10分/.test(li.textContent), lc = li.querySelector('.cond');
      const listCond = !!lc && lc.offsetHeight > 0 && lc.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) && !lc.closest('details') && /LINE のクーポンとは併用できません/.test(lc.textContent) && /売り出し期間中は使えません/.test(lc.textContent);   // visibility:hidden・opacity:0 でも 高さは のこるので、見えて いるかも 見る（Codex の 指摘）
      li.querySelector('[data-redeem]').click(); await wait(300);
      const cp = document.getElementById('coupon'), cond = document.getElementById('cpCond');
      const out = { found: true, chip, listCond, shown: !cp.hidden, cond: cond.hidden ? '' : cond.textContent, state: document.getElementById('cpState').textContent, validMin: (S.coupons[S.coupons.length - 1] || {}).validMin };
      // クーポン画面の 上に 知らせを 重ねない（店員さん向けの 説明が 読めなく なる）：開いて いる 間は 待たせて、とじたら 出す（自分で 遊んで 分かった）
      const tEl = document.getElementById('toast'), msg = '🎁 テストの 知らせ（クーポン）';
      G.toast(msg); await wait(200);
      out.toastOver = tEl.classList.contains('show') && tEl.textContent === msg;
      document.getElementById('cpClose').click();
      for (let i = 0; i < 40 && !(tEl.classList.contains('show') && tEl.textContent === msg); i++) await wait(200);   // ほかの 知らせが 出ていれば その あと（8秒まで 待つ）
      out.toastAfter = tEl.classList.contains('show') && tEl.textContent === msg;
      // ほかの クーポンとは いっしょに 使えない：使っていない クーポンが ある 間は、次の 交換が できない
      S.points += 600; G.openTab('rewards'); await wait(300);
      const li2 = [...document.querySelectorAll('#rewardList li')].find(l => /100円引き/.test(l.textContent));
      out.blocked = !!li2 && li2.querySelector('[data-redeem]').disabled && /使ってから|使っていないクーポン/.test(li2.textContent + li2.querySelector('[data-redeem]').getAttribute('aria-label'));
      const cpn = S.coupons[S.coupons.length - 1]; cpn.validMin = 0.02; G.openTab('rewards');   // 1.2秒で 期限切れに して、とくてんを 開いた まま 待つ
      window.__cp100 = { p0, n0, l0 };
      return out;
    });
    if (r.found && !r.skipped) {   // 期限が きれたら（とくてんを 開いた まま）描きなおされて「使ってから」が とける。テストの 時計は とまって いるので 2分 すすめる
      await page.clock.setFixedTime(new Date(new Date(PLAY_DATE).getTime() + 120000)); await page.waitForTimeout(2500);
      r.unblocked = await page.evaluate(() => { const li3 = [...document.querySelectorAll('#rewardList li')].find(l => /100円引き/.test(l.textContent)); return !!li3 && !/使ってから|使っていないクーポン/.test(li3.textContent + li3.querySelector('[data-redeem]').getAttribute('aria-label')); });
      await page.clock.setFixedTime(new Date(PLAY_DATE));
      await page.evaluate(() => { const G = nishioGo, S = G.state, o = window.__cp100; S.points = o.p0; S.coupons.length = o.n0; S.log.splice(0, S.log.length - o.l0); G.openTab('map'); });   // ほかの チェックの ポイントが かわらない よう もどす
    }
    page.off('dialog', onDialog);
    if (r.skipped) return { ok: true, ...r };
    return { ...r, ok: r.found && r.chip && r.shown && /1袋につき1回/.test(r.cond) && !r.toastOver && r.toastAfter && /LINE のクーポンとは併用できません/.test(r.cond) && /ほかのクーポン・割引とも併用できません/.test(r.cond) && /売り出し期間中は使えません/.test(r.cond) && r.listCond && r.validMin === 10 && /あと(9|10)分/.test(r.state) && r.blocked && r.unblocked };
  })();
  // きろくに「ころころの きろく」（コンボの ベスト・きょう ひろった ごはんつぶ）
  R.checks.koroRec = await page.evaluate(async () => {
    const old = localStorage.getItem('nsg_mz_speed'); localStorage.setItem('nsg_mz_speed', '21.6');   // はやさの ベストも のる
    const want = { c: nishioPixel.combo.best, d: nishioPixel.maze.dots.n };
    nishioGo.openTab('log'); await new Promise(f => setTimeout(f, 300));
    const box = document.getElementById('koroRec'), text = box && !box.hidden ? box.textContent : '';
    let share = 'skip';   // コンボの ベストが 3 いじょう なら「📣 シェア」→ シェアの 文と すぐ 遊べる リンク
    if (want.c >= 3) {
      const b = box.querySelector('[data-share-open="koro"]');
      if (b) { b.click(); await new Promise(f => setTimeout(f, 300)); }
      const st = document.getElementById('shareText').textContent;
      share = !!b && !document.getElementById('share').hidden && st.includes(`コンボ ベスト ×${want.c}`) && st.includes('はやさ 1秒に 21.6m') && st.includes('?play=1&utm_source=share&utm_medium=social&utm_campaign=koro');
      document.getElementById('share').hidden = true;
    }
    nishioGo.openTab('map');
    if (old === null) localStorage.removeItem('nsg_mz_speed'); else localStorage.setItem('nsg_mz_speed', old);
    return { ok: (!want.c || text.includes(`×${want.c}`)) && (!want.d || text.includes(`つぶ ${want.d}`)) && text.includes('はやさ ベスト 1秒に 21.6m') && share !== false, want, share, text: text.slice(0, 100) };
  });
  // バイラルループ：めいろの ゴールの ごほうびに「📣 シェア」→ 遊んだ 画面の カードと、見た 人が すぐ 遊べる リンク（?play=1・友だちの +20pt）
  R.checks.mzGoalShare = await page.evaluate(async () => {
    const G = nishioGo, img = G.snapMaze(), wait = ms => new Promise(f => setTimeout(f, ms));
    const mz = { name: 'テストの 名所', sec: 83.4, stars: 2, m: 420, run: { dots: 9, pads: 2, combo: 6 }, img, t: Date.now() };
    const btnOf = async () => { let b = null; for (let i = 0; i < 40 && !(b = document.querySelector('#reward.show .rw-share')); i++) await wait(250); return b; };   // ほかの ごほうびの あとに 出る ことも ある
    G.showReward(12, '🏁 テストの 名所に 着いた！', ['🌀 めいろ ゴール'], false, '', null, false, mz);
    const btn = await btnOf(), kind = btn ? btn.dataset.rwShare : '';
    if (btn) { btn.click(); await wait(300); }
    const text = document.getElementById('shareText').textContent, open = !document.getElementById('share').hidden;
    let png = 0; try { png = document.getElementById('shareCard').toDataURL('image/png').length; } catch (e) { png = -1; }   // 画像を 保存・送る（地図の 絵が よその 絵で よごれて いない）
    document.getElementById('share').hidden = true;
    const plain = async (lvUp, m) => { G.showReward(3, 'つぎの ごほうび', [], lvUp, '', null, false, m); await wait(400); const b = document.querySelector('#reward.show .rw-share'), k = b ? b.dataset.rwShare : ''; document.getElementById('reward').click(); await wait(200); return k; };
    const again = await plain(false);   // ゴールの ぶんを わたさない ごほうびには 出ない
    const lv = await plain(5, mz), after = await plain(false);   // レベルアップと かさなった ゴール → あとの ごほうびに 持ちこさない
    // 人の ゴール：話の 窓に「📣 ゴールを シェア」
    const n = G.npcs[0];
    let npc = 'no-npc', npcText = '';
    if (n) {
      G.callNpc(n.id);   // 動かずに 話せる あつかい（ほかの チェックの 位置・れんさを かえない）
      G.mzNpcShareTest = { ...mz, name: n.name, id: n.id };
      const box = document.getElementById('pxInfoBody'), r = G.talkNpc(n.id, 1);
      box.innerHTML = r ? r.html : ''; document.getElementById('pxInfo').hidden = false;
      const nb = box.querySelector('[data-mz-share]');
      if (nb) { nb.click(); await wait(300); npcText = document.getElementById('shareText').textContent; }
      npc = !!nb && !document.getElementById('share').hidden && npcText.includes(`「${n.name}」まで`);
      document.getElementById('share').hidden = true; document.getElementById('pxInfo').hidden = true; G.mzNpcShareTest = null;
      G.callNpc(null);
    }
    // ゴールの まち：西尾市なら 名物つき（抹茶とうなぎのまち・西尾の まち）、ほかの 市町は その 名前（西尾市の 外を「西尾の」と 言わない）
    const town = city => { G.openShare('mzgoal', { mzgoal: { ...mz, city } }); const t = document.getElementById('shareText').textContent; document.getElementById('share').hidden = true; return t.split('\n')[0]; };
    const tNishio = town('西尾市'), tHeki = town('碧南市');
    const townOk = /のまち・西尾の まちが めいろに/.test(tNishio) && /抹茶/.test(tNishio) && /^にしおさんぽGOで、碧南市の まちが めいろに/.test(tHeki) && !/西尾の まち/.test(tHeki);
    return { ok: townOk && kind === 'mzgoal' && open && png > 5000 && !again && lv === 'lvup' && !after && npc !== false && text.includes('「テストの 名所」まで 1分23秒 ★★') && text.includes('コンボ ×6') && text.includes('?play=1&vs=83&vst=2&utm_source=share&utm_medium=social&utm_campaign=mzgoal') && !!(img && img.width === 360), kind, open, png, again, lv, after, npc, img: !!img, tNishio, tHeki, text: text.slice(0, 160) };
  });
  // めいろの はやさの ベスト：道のり ÷ 時間で くらべ、こえたら「ベスト こえたじゃん！」、とどかなければ 足りない 数は 出さない（あおらない）。みじかい めいろは 数えない。札は「10m/秒」
  R.checks.mazeSpeed = await page.evaluate(async () => {
    const G = nishioGo, k = 'nsg_mz_speed', old = localStorage.getItem(k);
    localStorage.removeItem(k);
    const a = G.mzSpeed(400, 40), b = G.mzSpeed(400, 50), c = G.mzSpeed(600, 40), d = G.mzSpeed(50, 10), w = G.mzSpeed(2000, 10, true), best = localStorage.getItem(k);   // w：とびこえた ゴールは 数えない
    G.showReward(5, '🏁 テスト', ['🏁 めいろ ゴール！ 40秒', c, 'この 道で がんばったじゃん：🍚 つぶ 9・💨 びゅん 2・🎵 コンボ ×6'], false, '', null);
    await new Promise(f => setTimeout(f, 400));
    const html = document.getElementById('reward').innerHTML, chip = html.includes('15m/秒') && (!document.querySelector('#reward .chips') || html.includes('🍚9 💨2 🎵×6'));   // 文字を少なく では ふり返りも 数の 札
    document.getElementById('reward').click();
    if (old === null) localStorage.removeItem(k); else localStorage.setItem(k, old);
    const g = G.guide, gl = g && nishioPixel.maze.goal(g.id || g.name), warp = gl ? typeof gl.warp : 'no-goal';   // とびこえた ゴールを はやさから のぞく ための しるし
    return { a, b, c, d, w, best, chip, warp, ok: (warp === 'boolean' || warp === 'no-goal') && w === '' && /1秒に 10m（はじめての ベスト）/.test(a) && b === '🏃 はやさ 1秒に 8m' && /ベスト こえたじゃん！ 1秒に 15m（前 10m）/.test(c) && d === '' && best === '15' && chip };
  });
  // 行き先に 着いた ときの 知らせ（文字を少なく）：つぎの 行き先の 名前は 書かない（下の札と「🏁 つぎの ゴール」に 出る）。めいろでは 着いた 名所も「ゴール！」の 札に 出るので ポイント だけ
  R.checks.arriveMsg = await page.evaluate(() => {
    const G = nishioGo, b = document.body, had = b.classList.contains('simple');
    if (typeof G.arriveMsg !== 'function') return { ok: false, why: 'no-arriveMsg' };
    b.classList.add('simple');
    const g = { name: '西尾市歴史公園（西尾城跡）' }, next = { name: 'らいすぴあの店員さん（らいすぴあ秀幸（永吉））', why: 'テスト' };
    const maze = G.arriveMsg(g, 5, next, true), walk = G.arriveMsg(g, 5, next, false), none = G.arriveMsg(g, 0, next, true), ev = G.arriveMsg({ ...g, byId: 'x' }, 30, next, true);
    if (!had) b.classList.remove('simple');
    return { maze, walk, none, ev, ok: maze === '🧭 +5pt' && walk === '🧭 西尾市歴史公園（西尾城跡） +5pt' && none === '' && ev === '🎉 +30pt' };
  });
  // めいろの ゴールの あとの「めいろ、どうだった？」：★を えらび ひとことを 書いて 送ると、/api/feedback に kind: play・★・ひとこと・秒・めいろの★ が 届く。1日1回
  {
    const fb = [];
    await page.route('**/api/feedback', r => { fb.push(r.request().postData()); r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }); });
    R.checks.playRating = await page.evaluate(async () => {
      const G = nishioGo, S = G.state, p0 = S.points, t0 = S.total, wait = ms => new Promise(f => setTimeout(f, ms)), bar = document.getElementById('reactBar');
      localStorage.removeItem('nsg_play_ask'); document.getElementById('pxInfo').hidden = true;
      G.playAsk({ sec: 83.4, stars: 2 }); G.playShow();
      const shown = !bar.hidden && /めいろ、どうだった？/.test(bar.textContent);
      const big = parseFloat(getComputedStyle(bar.querySelector('[data-play]')).fontSize);   // ★は 大きく（タップ しやすく）
      bar.querySelector('[data-play="2"]').click();
      const share2 = !bar.querySelector('[data-play-share]').hidden;   // ★3 より 下では「友だちに」を 出さない
      bar.querySelector('[data-play="4"]').click();
      const on = bar.querySelectorAll('[data-play].on').length, more = !bar.querySelector('.play-more').hidden, share4 = !bar.querySelector('[data-play-share]').hidden;
      document.getElementById('playText').value = 'テストの ひとこと';
      bar.querySelector('[data-play-send]').click();
      for (let i = 0; i < 20 && !bar.hidden; i++) await wait(100);
      const closed = bar.hidden;
      G.playAsk({ sec: 50, stars: 3 });
      const again = !!G.playPending;   // 同じ 日は もう たずねない
      // ★を えらんで タブを 切りかえても ★だけ 届く（Codex の 指摘）
      localStorage.removeItem('nsg_play_ask');
      G.playAsk({ sec: 40, stars: 1 }); G.playShow();
      await wait(200);
      bar.querySelector('[data-play="5"]').click();
      document.querySelector('.tabs button[data-tab="voice"]').click();
      const tabClosed = bar.hidden && !bar.classList.contains('play');
      await wait(1200);
      document.querySelector('.tabs button[data-tab="map"]').click();
      // ★5 の「📣 友だちに」：★を 送って、めいろの ゴールの シェア（タイムに いどめる リンク）を ひらく
      localStorage.removeItem('nsg_play_ask');
      G.playAsk({ name: '西尾城', sec: 61, stars: 3 }); G.playShow();
      bar.querySelector('[data-play="5"]').click();
      bar.querySelector('[data-play-share]').click();
      await wait(1200);
      const sh = document.getElementById('share'), shareOpen = !sh.hidden && /vs=61/.test(document.getElementById('shareText').textContent) && bar.hidden;
      sh.hidden = true;
      // 人が ゴールの めいろ：話の 窓（pxInfo）が 出て いる 間は 出さず、とじたら 出る
      localStorage.removeItem('nsg_play_ask');
      const px = document.getElementById('pxInfo'); px.hidden = false;
      G.playAsk({ name: '駅前の学生', sec: 45, stars: 1 });
      await wait(100);
      const npcWait = bar.hidden;
      // 話の 窓を 開いた まま タブを 切りかえて もどっても、とっておく（Codex の 指摘：ここで 使い切って その日は たずねられなかった）
      document.querySelector('.tabs button[data-tab="log"]').click(); await wait(100);
      document.querySelector('.tabs button[data-tab="map"]').click(); await wait(100);
      const npcKeep = !!G.playPending && bar.hidden && localStorage.getItem('nsg_play_ask') === null;
      px.hidden = true; await wait(100);
      const npcShown = !bar.hidden && /めいろ、どうだった？/.test(bar.textContent);
      bar.querySelector('[data-play-x]').click();
      S.points = p0; S.total = t0; G.save && G.save();
      return { shown, big, on, more, share2, share4, closed, again, tabClosed, shareOpen, npcWait, npcKeep, npcShown, day: localStorage.getItem('nsg_play_ask') };
    });
    await page.unroute('**/api/feedback');
    const js = x => { try { return JSON.parse(x || 'null'); } catch (e) { return null; } }, body = js(fb[0]), tab = js(fb[1]), viaShare = js(fb[2]);
    const c = R.checks.playRating;
    R.checks.playRating = { ...c, sent: fb.length, body, tab, viaShare, ok: c.shown && c.big >= 30 && c.on === 4 && c.more && c.closed && !c.again && !!body && body.kind === 'play' && body.r === 4 && body.text === 'テストの ひとこと' && body.sec === 83 && body.st === 2 && c.tabClosed && !!tab && tab.r === 5 && tab.text === '' && tab.sec === 40 && !c.share2 && c.share4 && c.shareOpen && !!viaShare && viaShare.r === 5 && viaShare.sec === 61 && c.npcWait && c.npcKeep && c.npcShown && fb.length === 3 };
  }
  // 高低差で とぶ：作った地形（平ら → 2マス先から 20% の下り坂）を 速く こえると とぶ
  // 転がす（めいろ）ときも、せかいちずで 矢印キーを 押すと 歩く地図に もどる
  await page.evaluate(() => { nishioPixel.setRoll(true); nishioPixel.setWorld(true); }); await page.waitForTimeout(300);
  await page.keyboard.down('ArrowUp'); await page.waitForTimeout(200); await page.keyboard.up('ArrowUp'); await page.waitForTimeout(300);
  R.checks.rollKeyLeavesWorld = await page.evaluate(() => !nishioPixel.worldMode);
  await page.evaluate(() => nishioPixel.setRoll(false));
  // 地図の めいろ（メインの 遊び）：転がす ときは めいろ。お米の まわりの 区域が できていて、通路の マスに 通れない さかい（壁）がある
  R.checks.mapMaze = await page.evaluate(async () => {
    nishioPixel.setRoll(true);
    const M = nishioPixel.maze, r = nishioPixel.roll, K = M.K, at = { lat: nishioGo.me.lat, lng: nishioGo.me.lng };   // めいろは 壁の かたまりの 中から 通路へ うつすので、あとで もとの 所へ もどす（この先の 台本の 位置が かわらないように）
    for (let i = 0; i < 40 && M.type(Math.floor(r.x / K), Math.floor(r.y / K)) < 0; i++) await new Promise(f => setTimeout(f, 250));
    const cx = Math.floor(r.x / K), cy = Math.floor(r.y / K);
    let floors = 0, walls = 0;
    for (let y = cy - 6; y <= cy + 6; y++) for (let x = cx - 6; x <= cx + 6; x++) if (M.type(x, y) === 1) { floors++; for (const [dx, dy] of [[1, 0], [0, 1]]) if (M.type(x + dx, y + dy) === 1 && !M.open(x, y, dx, dy)) walls++; }
    const on = M.on();
    for (let i = 0; i < 12 && !M.trail().length; i++) await new Promise(f => setTimeout(f, 250));   // 足あと：いる 通路の マスに しるし
    const trail = M.trail().length;
    // ゴールまでの タイムと ★：行き先が あれば 時計が 動き、目やすの 時間（★3）が きまる
    let clock = !nishioGo.guide ? 'no-goal' : false;
    for (let i = 0; i < 12 && clock === false; i++) { await new Promise(f => setTimeout(f, 250)); const c = M.clock(); if (c && c.par >= 20 && c.stars >= 1 && c.stars <= 3 && c.sec >= 0) clock = { par: Math.round(c.par), stars: c.stars }; }
    // 金の米つぶ：行き止まりに おちていて、ころがって 入ると ひろえる（その日は もう 出ない）
    const near = M.grainsNear(20);
    let grain = near.length ? false : 'none-near';
    if (near.length) {
      const [gx, gy] = near[0], n0 = nishioGo.mzGrains, c0 = M.clock(), s0 = c0 ? c0.sec : 0, t0 = performance.now();
      nishioPixel.rollPut(gx * K + 1.5, gy * K + 1.5);
      for (let i = 0; i < 8 && grain === false; i++) { await new Promise(f => setTimeout(f, 150)); if (nishioGo.mzGrains === n0 + 1 && !M.grainsNear(20).some(([x, y]) => x === gx && y === gy)) grain = true; }
      const c1 = M.clock();   // ひろうと 時計が 2秒 もどる（時計が 2秒 より 進んで いれば）
      if (grain === true && c0 && c1) { const back = s0 + (performance.now() - t0) / 1000 - c1.sec; grain = { back: Math.round(back * 10) / 10 }; if (s0 > 2.5 && back < 1.5) grain = false; }
    }
    nishioPixel.setRoll(false); nishioGo.moveTo(at.lat, at.lng);
    return { ok: on && floors > 10 && walls > 3 && trail > 0 && grain !== false && clock !== false, on, floors, walls, trail, grain, grains: near.length, clock };
  });
  // めいろの 壁（生け垣）に 押しつけても、お米が 壁に 食いこんで 見えない（左右は 壁の さかいから 0.6マスより 手前で 止まる）。当たると 葉っぱが 舞う
  R.checks.mazeWallFit = await (async () => {
    await page.evaluate(() => nishioPixel.setRoll(true)); await page.waitForTimeout(400);
    const at = await page.evaluate(() => ({ lat: nishioGo.me.lat, lng: nishioGo.me.lng, cs: { ...nishioPixel.critterState } }));   // 歩数は あとで もどす（この先の チェックで 生きものに 出会う 時が ずれないように）
    const c = await page.evaluate(() => { const M = nishioPixel.maze, r = nishioPixel.roll, K = M.K, cx = Math.floor(r.x / K), cy = Math.floor(r.y / K);
      const deadL = (x, y) => M.open(x, y, -1, 0) && !M.open(x, y, 0, 1) && !M.open(x, y, 0, -1);   // ゆるい めいろ：左だけ 開いた 行き止まり（曲がる カーブが なく、右の 壁に まっすぐ 当たる）
      for (const want of M.near ? [deadL, () => true] : [() => true]) for (let d = 0; d < 12; d++) for (let y = cy - d; y <= cy + d; y++) for (let x = cx - d; x <= cx + d; x++) if (M.type(x, y) === 1 && M.type(x + 1, y) === 1 && !M.open(x, y, 1, 0) && want(x, y)) return { x, y, K };
      return null; });
    if (!c) { await page.evaluate(() => nishioPixel.setRoll(false)); return { ok: false, why: 'no wall' }; }
    let hitMood, r, env, tr, tries = 0;
    do {   // 押しつけて いる 間に 窓（ごほうび など）が 出て 止められたら、閉じて 置きなおす（3回まで）
      await uncover(page);
      await page.evaluate(([x, y, K]) => nishioPixel.rollPut(x * K + 0.9, y * K + 1.5, 5, 0), [c.x, c.y, c.K]);
      env = await rollEnv(page); await traceOn(page);
      hitMood = '';
      for (let i = 0; i < 40 && !hitMood; i++) { await page.waitForTimeout(40); const q = await page.evaluate(() => nishioPixel.roll); if (q.vx < 0) hitMood = q.mood; }   // はね返った（遅い 画面でも 待てるよう 1.6秒まで）
      await page.keyboard.down('ArrowRight'); await page.waitForTimeout(1500);
      r = await page.evaluate(() => nishioPixel.roll); tr = await traceOff(page);   // 押しつけて いる 間に 見る（やわらかい 生け垣は はなすと ぽよんと 押しかえす）
      await page.keyboard.up('ArrowRight'); await page.waitForTimeout(400);
    } while (traceBusy(tr) && ++tries < 3);
    const gap = +((c.x + 1) * c.K - r.x).toFixed(3);
    // ゆるい めいろ（2026-10-26）：壁は マスの さかいでは なく、道すじの 筒の ふち（道すじから 0.45マス）。押しつけたら 筒の ふちで 止まり、とじた さかいの 先の マスへ 行かない
    const tube = await page.evaluate(([x, y]) => { const q = nishioPixel.maze.near && nishioPixel.maze.near(x, y); return q ? +q.d.toFixed(3) : null; }, [r.x, r.y]);
    const same = Math.floor(r.x / c.K) === c.x && Math.floor(r.y / c.K) === c.y;
    await page.evaluate(() => nishioPixel.setRoll(false)); await page.evaluate(ll => { nishioGo.moveTo(ll.lat, ll.lng); Object.assign(nishioPixel.critterState, ll.cs); }, at);
    const fit = tube !== null ? tube >= 0.4 && tube <= 0.5 && same : gap >= 0.6 && gap < 1;
    const ok = fit && !!hitMood;
    return { ok, gap, tube, same, bounced: !!hitMood, hitMood, tries, ...(ok ? {} : { cell: [c.x, c.y], env, tr }) };
  })();
  R.checks.heightJump = await (async () => {
    await page.evaluate(() => nishioPixel.setRoll(true)); await page.waitForTimeout(400);
    const pick = await page.evaluate(() => { const r = nishioPixel.roll; let best = null; for (const [k, dx, dy] of [['ArrowLeft', -1, 0], ['ArrowRight', 1, 0], ['ArrowUp', 0, -1], ['ArrowDown', 0, 1]]) { let d = 1; while (d < 14 && !nishioPixel.rollBlockedFrom(r.x + dx * (d - 1), r.y + dy * (d - 1), r.x + dx * d, r.y + dy * d)) d++; if (!best || d > best[1]) best = [k, d, dx, dy]; } return { best, x: r.x, y: r.y, j: r.jumps }; });
    const [k, d, dx, dy] = pick.best;
    if (d < 6) { await page.evaluate(() => nishioPixel.setRoll(false)); return { ok: true, skipped: 'no-room', d }; }
    await page.evaluate(([x0, y0, dx, dy]) => nishioPixel.setHeightFn((x, y) => { const s = (x - x0) * dx + (y - y0) * dy; return s < 2 ? 15 : 15 - (s - 2) * 1.6; }), [pick.x, pick.y, dx, dy]);
    // へりを こえるとき ちょうど「ぴょん」で とんでいても、地面が 下がる ぶん 高く とびつづける（とぶ 回数には 入らない）ので、へりの 先で とんだ 高さも 見る
    await page.keyboard.down(k); let vmax = 0, far = 0, hmax = 0;
    for (let i = 0; i < 44; i++) { await page.waitForTimeout(50); const r = await page.evaluate(() => nishioPixel.roll), s = (r.x - pick.x) * dx + (r.y - pick.y) * dy; vmax = Math.max(vmax, Math.hypot(r.vx, r.vy)); far = Math.max(far, s); if (s > 2.2) hmax = Math.max(hmax, r.h); }
    await page.keyboard.up(k);
    const busy = await page.evaluate(() => nishioPixel.sightBusy() || nishioPixel.mapCovered() || !document.getElementById('pxInfo').hidden);
    const j = await page.evaluate(() => nishioPixel.roll.jumps);
    await page.evaluate(() => { nishioPixel.setHeightFn(null); nishioPixel.setRoll(false); });
    return { room: d, jumps: j - pick.j, hmax: +hmax.toFixed(2), vmax: +vmax.toFixed(2), far: +far.toFixed(2), busy, ok: j - pick.j >= 1 || hmax > 0.25 };
  })();
  // 転がり方 200：名前が ぜんぶ ちがい、きょうの転がり方が えらべて、ずかんが 開く
  R.checks.koroStyles = await page.evaluate(() => {
    const K = window.NISHIO_KOROSTYLE; if (!K) return { ok: false };
    const L = K.list(), uniq = new Set(L.map(x => x.name)).size;
    const sel = K.select('daily'), cur = K.current();
    K.open(); const cells = document.querySelectorAll('#koroDex .kd-cell').length; K.close();
    const need = K.need ? K.need() : 0, have = K.state.u.length;   // 次までの 道のりは 持っている 数で のびる（40・80・…・240マス）
    return { n: L.length, uniq, daily: cur && cur.name, cells, need, have, ok: L.length === 200 && uniq === 200 && sel && !!cur && cells === 200 && need === 40 * Math.min(have + 1, 6) };
  });
  // 転がり方を もらう 道のり：1マスずつ 歩くと 数え、ひとっとび（25マス 先へ）は 数えない（とんだ あと 画面が なめらかに 追いつく ぶんを 数えて いて、こまの 速さで 入る 量が かわった）
  R.checks.koroDist = await page.evaluate(async () => {
    const K = window.NISHIO_KOROSTYLE, G = nishioGo, P = nishioPixel, st = K.state, d0 = st.dist, at = { lat: G.me.lat, lng: G.me.lng }, cs = { ...P.critterState }, wait = ms => new Promise(f => setTimeout(f, ms));
    const go = (dx, kind) => { const a = P.toTile(G.me.lat, G.me.lng), ll = P.toLatLng(a.x + dx, a.y); G.moveTo(ll.lat, ll.lng, kind); };
    st.dist = 0;
    go(25); await wait(2000);
    const jump = st.dist;
    for (let i = 0; i < 4; i++) { go(i % 2 ? -1 : 1, 'step'); await wait(200); }
    const steps = st.dist - jump;
    st.dist = d0; G.moveTo(at.lat, at.lng); Object.assign(P.critterState, cs); await wait(300);   // 歩数も もどす（この先の チェックで 生きものに 出会う 時が ずれないように）
    return { jump: +jump.toFixed(2), steps: +steps.toFixed(2), ok: jump < 3 && steps >= 3 };
  });
  // 西尾めいろ：1面（西尾駅）の盤ができて、スタートから ゴールまで 道で つながっている。矢印キーで お米が動き、ゴールに着くと「ゴール！」。とじると 歩く地図が また動く
  R.checks.meiro = await (async () => {
    const opened = await page.evaluate(() => window.NISHIO_MEIRO && NISHIO_MEIRO.open(0));
    if (!opened) return { ok: false, opened };
    const built = await page.waitForFunction(() => NISHIO_MEIRO.game && NISHIO_MEIRO.game.board, null, { timeout: 30000 }).then(() => true, () => false);
    if (!built) { await page.evaluate(() => NISHIO_MEIRO.close()); return { ok: false, built }; }
    const b = await page.evaluate(() => { const g = NISHIO_MEIRO.game, b = g.board; return { spot: g.spot.name, len: b.len, tw: b.tw, th: b.th, x: g.x, y: g.y }; });
    await shot(page, '07d-meiro');
    await page.waitForFunction(() => NISHIO_MEIRO.game.cd <= 0, null, { timeout: 6000 }).catch(() => {});   // はじめの 3・2・1 が おわるまで
    const k = await page.evaluate(() => { const b = NISHIO_MEIRO.game.board, [x, y] = b.start, i = y * b.tw + x; return b.er[i] ? 'ArrowRight' : x > 0 && b.er[i - 1] ? 'ArrowLeft' : b.ed[i] ? 'ArrowDown' : 'ArrowUp'; });   // スタートから 通れる向き
    await page.keyboard.down(k); await page.waitForTimeout(400); await page.keyboard.up(k);
    const moved = await page.evaluate(([x0, y0]) => { const g = NISHIO_MEIRO.game; return Math.hypot(g.x - x0, g.y - y0); }, [b.x, b.y]);
    // 金の米つぶは ぜんぶ スタートから とれる所・💡 ヒントで 道すじが出る・いちらんから「もどる」で つづき（位置が かわらない）
    const extra = await page.evaluate(() => {
      const g = NISHIO_MEIRO.game, b = g.board, tw = b.tw, d = new Uint8Array(tw * b.th), q = [b.start[1] * tw + b.start[0]];
      const pass = (x, y, dx, dy) => (dx === 1 ? x + 1 < tw && b.er[y * tw + x] : dx === -1 ? x > 0 && b.er[y * tw + x - 1] : dy === 1 ? y + 1 < b.th && b.ed[y * tw + x] : y > 0 && b.ed[(y - 1) * tw + x]);
      d[q[0]] = 1;
      for (let h = 0; h < q.length; h++) { const i = q[h], x = i % tw, y = (i / tw) | 0; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const j = (y + dy) * tw + x + dx; if (!pass(x, y, dx, dy) || d[j] || b.cell[j] !== 1 || b.holes.has(j)) continue; d[j] = 1; q.push(j); } }
      document.querySelector('#meiro [data-mz=hint]').click();
      const hint = g.hint ? g.hint.path.length : 0, x0 = g.x, y0 = g.y;
      document.querySelector('#meiro [data-mz=list]').click(); document.querySelector('#meiro [data-mz=resume]').click();
      return { grains: b.grains.length, grainsOk: b.grains.every(i => d[i]), hint, resume: NISHIO_MEIRO.game === g && g.x === x0 && g.y === y0 && document.querySelector('#meiro .mz-clear').hidden };
    });
    await page.evaluate(() => { const g = NISHIO_MEIRO.game; NISHIO_MEIRO.warp(g.board.goal[0] + 0.5, g.board.goal[1] + 0.5); });
    const goal = await page.waitForFunction(() => !document.querySelector('#meiro .mz-clear').hidden && /ゴール/.test(document.querySelector('#meiro .mz-card').innerText), null, { timeout: 5000 }).then(() => true, () => false);
    await page.evaluate(() => NISHIO_MEIRO.close());
    const back = await page.evaluate(() => document.getElementById('meiro').hidden);
    return { ...b, ...extra, moved: +moved.toFixed(2), goal, back, ok: b.len >= 8 && moved > 0.3 && goal && back && extra.grainsOk && extra.hint > 0 && extra.resume };
  })();
  R.checks.critter = await page.evaluate(() => { const c = nishioGo.meetCritter('paddy'); return !!c && !!nishioPixel.critterSprite(c.id) && !!nishioGo.state.critters[c.id]; });
  // イベント「ドット絵ムービー」：八ツ面山でチェックインすると、ごほうびの画面のあとに「山の岩のなりたち」が流れ、最後まで見ると まちメモ に残る
  await page.evaluate(() => { window.__keepMovie = true; const s = nishioGo.spots.find(x => x.id === 'f-yatsuomote'); nishioGo.moveTo(s.lat, s.lng); });
  await page.waitForTimeout(1500);
  await page.evaluate(() => { document.getElementById('pxInfo').hidden = true; const r = document.getElementById('reward'); if (r.classList.contains('show')) r.click(); });
  await page.click('#spinBtn').catch(() => {}); await page.waitForTimeout(800);
  R.checks.movieAfterReward = await page.evaluate(() => { const rw = document.getElementById('reward').classList.contains('show'), mv = !!(window.NISHIO_MOVIE && NISHIO_MOVIE.playing); return { rw, mv, ok: rw && !mv }; });   // ムービーは ごほうびの 窓を とじてから（ごほうびの 上に 出て かくさない）
  // ごほうびの「📣 シェア」を おしたら、シェアの 画面を とじるまで ムービーは 待つ（ムービーが シェアの 上に 出て かくしていた）
  R.checks.movieAfterShare = await (async () => {
    const opened = await page.evaluate(() => { const b = document.querySelector('#reward [data-rw-share]'); if (!b) return false; b.click(); return !document.getElementById('share').hidden; });
    if (!opened) return { opened, ok: true };
    await page.waitForTimeout(1500);
    const during = await page.evaluate(() => !!(window.NISHIO_MOVIE && NISHIO_MOVIE.playing));
    await page.evaluate(() => document.querySelector('#share [data-share="close"]').click());
    return { opened, during, ok: !during };
  })();
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
  // ガイドさんの記録：西尾城跡のガイドさんの話に「📒 記録しといたよ。つぎの レベル○まで あと○pt。しるしは ○/5 …」（2ページ目から読むので、行き先などは変わらない）
  R.checks.guideRecord = await page.evaluate(async () => {
    const g = nishioGo.npcs.find(n => n.id === 'castle-guide');
    if (!g) return { ok: false, why: 'no-guide' };
    nishioGo.moveTo(g.lat, g.lng); await new Promise(r => setTimeout(r, 400));
    const html = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(p => (nishioGo.talkNpc(g.id, p) || {}).html || '').join('');
    const m = html.match(/📒 記録しといたよ。つぎの レベル(\d+)まで あと(\d+)pt。しるしは (\d)\/5/);
    const st = nishioGo.stats();
    return { text: m ? html.slice(html.indexOf('📒'), html.indexOf('📒') + 120).replace(/<[^>]+>.*/, '') : html.replace(/<[^>]+>/g, ' ').slice(0, 160), ok: !!m && +m[1] === st.lv + 1 && +m[2] > 0 };
  });
  // しるしをくれる人：一色の魚屋のおかみさんの話に「🔖 一色の注目スポットを あと○か所 めぐったら…（いま ○/5）」
  R.checks.sealPage = await page.evaluate(async () => {
    const n = nishioGo.npcs.find(x => x.id === 'sakana-okami');
    if (!n) return { ok: false, why: 'no-npc' };
    let near = false;
    for (let k = 0; k < 10 && !near; k++) { nishioGo.moveTo(n.lat, n.lng); await new Promise(r => setTimeout(r, 400)); near = !!(nishioGo.talkNpc(n.id, 1) || {}).near; }   // 地図を読みこむと 立つマスが ずれることがあるので、話せる所まで
    const html = Array.from({ length: 15 }, (_, i) => (nishioGo.talkNpc(n.id, i + 1) || {}).html || '').join('');
    const m = html.match(/🔖 一色の注目スポットを あと(\d)か所 めぐったら、一色のしるしを わたすでね（いま (\d)\/(\d)）/);
    return { near, text: m ? m[0] : html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(-200), ok: !!m && +m[1] + +m[2] === +m[3] };
  });
  // 遠いほど めずらしい：西尾城跡から 8km をこえた所（吉良の南）へ行くと、その日1回「キラの絵が 2倍 出やすい」と知らせる
  R.checks.kiraFar = await page.evaluate(async () => {
    const seen = [], el = document.getElementById('toast'), ob = new MutationObserver(() => seen.push(el.textContent)); ob.observe(el, { childList: true, characterData: true, subtree: true });
    nishioGo.moveTo(34.79, 137.10);
    const queued = () => (nishioGo.toastAfter.q || []).some(t => /8km こえた！.*2倍/.test(t));   // 知らせは ほかの知らせの あとに順に出る（待ちの列に入っていれば よい）
    for (let i = 0; i < 10 && !queued() && !seen.some(t => /8km こえた/.test(t)); i++) { await new Promise(r => setTimeout(r, 500)); const rw = document.getElementById('reward'); if (rw.classList.contains('show')) rw.click(); }   // ほかの知らせの あとに出る
    ob.disconnect();
    const told = (nishioGo.state.day || {}).farTold, said = seen.some(t => /8km こえた！.*2倍/.test(t)) || queued();
    return { told, said, seen: [...new Set(seen)].slice(-6), showing: el.classList.contains('show') ? el.textContent : '', ok: told === 2 && said };
  });
  // 路地の行き止まり：近くで 道が終わるマスを探し、そこへの1歩（critterStep）で「🔍 路地の行き止まりを しらべたら 見つかった！」と +3pt。同じマスは2回目は出ない
  R.checks.alley = await page.evaluate(async () => {
    const rw = document.getElementById('reward'); if (rw.classList.contains('show')) rw.click(); await new Promise(r => setTimeout(r, 400));
    const P = nishioPixel, me = nishioGo.me, t = P.toTile(me.lat, me.lng), x0 = Math.floor(t.x), y0 = Math.floor(t.y);
    let at = null;
    for (let r = 1; r < 80 && !at; r++) for (let dy = -r; dy <= r && !at; dy++) for (let dx = -r; dx <= r; dx++) if ((Math.abs(dx) === r || Math.abs(dy) === r) && P.alleyEnd(x0 + dx, y0 + dy)) { at = [x0 + dx, y0 + dy]; break; }
    if (!at) return { ok: true, skipped: 'no-alley' };
    window.__alleyAt = at;
    const nb = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => [at[0] + dx, at[1] + dy]).find(([x, y]) => !P.blockedAt(x + 0.5, y + 0.5) && !P.alleyEnd(x, y)) || at;
    const ll = P.toLatLng(nb[0] + 0.5, nb[1] + 0.5); nishioGo.moveTo(ll.lat, ll.lng); P.centerOnMe && P.centerOnMe();   // となりのマスへ（タップの移動なので 足あとは つかない）
    return { at, pending: true };
  });
  await page.waitForTimeout(800); await shot(page, '10-alley');   // まだ しらべていない 行き止まりに「？」
  if (R.checks.alley.pending) R.checks.alley = await page.evaluate(async () => {
    const rw = document.getElementById('reward'), P = nishioPixel, at = window.__alleyAt;
    const p0 = nishioGo.state.points;
    P.critterStep(at[0], at[1]); await new Promise(r => setTimeout(r, 600));
    const shown = rw.classList.contains('show') && /路地の行き止まり/.test(rw.innerText), got = nishioGo.state.points - p0;
    if (rw.classList.contains('show')) rw.click(); await new Promise(r => setTimeout(r, 400));
    P.critterStep(at[0], at[1]); await new Promise(r => setTimeout(r, 300));
    const again = rw.classList.contains('show') && /路地の行き止まり/.test(rw.innerText);
    return { at, shown, got, again, ok: shown && got >= 3 && !again && nishioGo.state.log.some(l => l.type === 'alley') };
  });
  // しるしの2枚：地区のしるしを もらったら（ここでは 待ちの記録を直接つくる）、その地区の題材の 2枚から えらんだ1枚だけが キラで入る
  R.checks.sealPick = await page.evaluate(async () => {
    const rw = document.getElementById('reward'); if (rw.classList.contains('show')) rw.click();
    document.getElementById('pxInfo').hidden = true; await new Promise(r => setTimeout(r, 700));
    const D = window.NISHIO_DOTS, cands = nishioGo.sealCands('nishio');
    const inArea = cands.every(id => (D.MOTIFS[D.motifOf(id)].areas || []).includes('nishio')), two = cands.length === 2 && D.motifOf(cands[0]) !== D.motifOf(cands[1]);
    nishioGo.state.sealPicks = [{ area: 'nishio', name: '西尾', cands }, { area: 'isshiki', name: '一色', cands: nishioGo.sealCands('isshiki') }];   // 2地区ぶん 積む（1つめを えらぶと、2つめが残る）
    nishioGo.sealPickCheck();
    for (let i = 0; i < 20 && document.getElementById('pxInfo').hidden; i++) await new Promise(r => setTimeout(r, 200));
    const body = document.getElementById('pxInfoBody'), shown = !document.getElementById('pxInfo').hidden && /西尾のしるしの1枚を えらぼう/.test(body.innerText) && body.querySelectorAll('[data-pick-dot]').length === 2;
    return { shown, inArea, two, cands };
  });
  await shot(page, '09-seal-pick');
  R.checks.sealPick = await page.evaluate(async c => {
    const btn = document.querySelectorAll('#pxInfoBody [data-pick-dot]')[1]; if (btn) btn.click();
    await new Promise(r => setTimeout(r, 300));
    const st = nishioGo.state, k = c.cands;
    return { shown: c.shown, inArea: c.inArea, two: c.two, queued: (st.sealPicks || []).map(x => x.area), ok: c.shown && c.inArea && c.two && (st.sealPicks || []).length === 1 && st.sealPicks[0].area === 'isshiki' && st.kira.includes(k[1]) && !st.kira.includes(k[0]) && st.dots.includes(k[1]) };
  }, R.checks.sealPick);
  // 水べで じっと見る：水の となりのマスへ行って 5秒 止まっていると、水の中の生きものに出会う（1日2回まで）
  R.checks.waterWatch = await page.evaluate(async () => {
    const rw = document.getElementById('reward'); if (rw.classList.contains('show')) rw.click();
    document.getElementById('pxInfo').hidden = true;
    const P = nishioPixel, C = P.C, me = nishioGo.me, t = P.toTile(me.lat, me.lng), x0 = Math.floor(t.x), y0 = Math.floor(t.y);
    let at = null;
    for (let r = 1; r < 120 && !at; r++) for (let dy = -r; dy <= r && !at; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
      const x = x0 + dx, y = y0 + dy;
      if (!P.blockedAt(x + 0.5, y + 0.5) && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([a, b]) => P.codeAt(x + a, y + b) === C.A)) { at = [x, y]; break; }
    }
    if (!at) return { ok: true, skipped: 'no-water' };
    const day = nishioGo.state.day || {}, c0 = day.critters || 0;
    if (c0 >= 5) return { ok: true, skipped: 'critter-cap' };
    const ll = P.toLatLng(at[0] + 0.5, at[1] + 0.5); nishioGo.moveTo(ll.lat, ll.lng);
    await new Promise(r => setTimeout(r, 5500));
    const d = nishioGo.state.day || {};
    return { at, watch: d.watch || 0, critters: (d.critters || 0) - c0, ok: d.watch === 1 && (d.critters || 0) === c0 + 1 };
  });
  // はじめての出会いは かならず・待ちすぎない：まだ1回も会っていなければ 田んぼの25歩目までに、会ったことがあれば 100歩目で かならず出会う（運は いつも外れにしておく）
  // のこりの数：田んぼに入ると「🌾 田んぼ：まだ会っていない生きもの N」（N は いまの季節に会えて 手帳にない数）
  R.checks.critterSure = await page.evaluate(() => {
    const G = nishioGo, P = nishioPixel, C = P.C, st = G.state, day = st.day || (st.day = {});
    const t = P.toTile(G.me.lat, G.me.lng), x0 = Math.floor(t.x), y0 = Math.floor(t.y);
    let hit = null, off = null;
    for (let r = 0; r < 160 && !(hit && off); r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      const c = P.codeAt(x0 + dx, y0 + dy);
      if (!hit && (c === C.F || c === C.U)) hit = [x0 + dx, y0 + dy];
      if (!off && c === C.R && ![[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]].some(([a, b]) => [C.F, C.U, C.A].includes(P.codeAt(x0 + dx + a, y0 + dy + b)))) off = [x0 + dx, y0 + dy];
    }
    if (!hit || !off) return { ok: true, skipped: 'no-paddy' };
    const book0 = st.critters, n0 = day.critters, rnd = Math.random;
    Math.random = () => 0.99;   // 運は いつも外れ（かならずの出会いだけが起きる）
    // きろく を開いたまま田んぼに入ると 知らせは出ず、閉じたあとの田んぼの1歩で出る（手帳は そのまま・歩数は0から）
    P.critterState.told = {}; P.critterState.steps = 0;
    const nTold = () => P.floats().filter(f => /田んぼ：まだ会っていない生きもの/.test(f)).length, f0 = nTold();
    P.critterStep(off[0], off[1]);
    document.querySelector('.tabs button[data-tab="log"]').click();
    P.critterStep(hit[0], hit[1]); const underPanel = nTold() - f0;
    document.querySelector('.tabs button[data-tab="map"]').click();
    P.critterStep(hit[0], hit[1]); const afterPanel = nTold() - f0;
    st.critters = {}; day.critters = 0;
    P.critterState.told = {}; P.critterState.steps = 0;
    P.critterStep(off[0], off[1]);   // 田んぼの外から入る
    const left = G.critterLeft('paddy');
    let first = 0, told = '';
    const f1 = nTold();
    for (let i = 1; i <= 30 && !first; i++) {
      P.critterStep(hit[0], hit[1]);
      if (i === 1 && nTold() > f1) told = P.floats().filter(f => /田んぼ：まだ会っていない生きもの/.test(f)).pop();
      if (day.critters === 1) first = i;
    }
    let next = 0; for (let i = 1; i <= 120 && !next; i++) { P.critterStep(hit[0], hit[1]); if (day.critters === 2) next = i; }
    Math.random = rnd;
    const all = G.critterLeft('paddy');
    day.critters = 5; const capped = G.critterLeft('paddy');
    st.critters = Object.assign(book0 || {}, st.critters); day.critters = n0 || 0;
    return { left, told, first, next, capped, underPanel, afterPanel, ok: underPanel === 0 && afterPanel === 1 && !!left && left.left === left.all && left.all > 0 && told.endsWith(' ' + left.all) && first === 25 && next === 100 && all.left < left.all && capped === null };
  });
  R.errors.push(...errors);
  await ctx.close();

  // 位置を待つ間の まちメモ：あるいて移動で 位置が届かない間は、下のパネルに まちメモ（はじめは地区の豆知識）が出て 7秒ごとに かわる。4秒より長く待ったあとに届いたら「📍 いまの場所が わかった」
  {
    const w = await newPage(browser);
    await w.ctx.addInitScript(() => {
      localStorage.setItem('nsg_started', 'true'); localStorage.setItem('nsg_mode', '"real"');
      navigator.geolocation.watchPosition = ok => { window.__geo = ok; return 1; }; navigator.geolocation.clearWatch = () => {};
      window.__toasts = [];
      document.addEventListener('DOMContentLoaded', () => { const el = document.getElementById('toast'); new MutationObserver(() => window.__toasts.push(el.textContent)).observe(el, { childList: true, characterData: true, subtree: true }); });
    });
    await w.page.goto(URL); await w.page.waitForTimeout(2500);
    const fact = () => w.page.evaluate(() => { const f = document.querySelector('#status .wait-fact'); return f ? f.textContent : ''; });
    const f1 = await fact(); await shot(w.page, '11-wait-fact'); await w.page.waitForTimeout(7500); const f2 = await fact();
    await w.page.clock.setFixedTime(new Date(new Date(PLAY_DATE).getTime() + 6000));
    await w.page.evaluate(([la, lo]) => window.__geo({ coords: { latitude: la, longitude: lo, accuracy: 10 }, timestamp: Date.now() }), STATION);
    await w.page.waitForTimeout(2500);
    for (let i = 0; i < 4; i++) {   // ようこそ たからばこ の知らせが先に出たら、閉じたあとに出る
      if (await w.page.evaluate(() => window.__toasts.some(t => /いまの場所が わかった/.test(t)))) break;
      await w.page.evaluate(() => { const r = document.getElementById('reward'); if (r.classList.contains('show')) r.click(); document.querySelectorAll('[data-pick-dot]')[0]?.click(); });
      await w.page.waitForTimeout(1500);
    }
    const after = await w.page.evaluate(() => ({ fact: !!document.querySelector('#status .wait-fact'), ready: window.__toasts.some(t => /いまの場所が わかった/.test(t)), toasts: window.__toasts.slice(-4), me: !!nishioGo.me, reward: document.getElementById('reward').classList.contains('show') }));
    R.checks.waitFact = { f1, f2, ...after, ok: !!f1 && !!f2 && f1 !== f2 && !after.fact && after.ready };
    R.errors.push(...w.errors);
    await w.ctx.close();
  }

  // 盤の めいろ：横向きの 低い 画面（667×375）では 盤を 左・ヒントと ボタンを 右に ならべ、スクロール しないで 全部 見える。やわらかい ふちに 強く 当たると ぽよん（地図と 同じ きまり）・へこみが のびて ぷるぷる もどる、そっと 当たると 鳴らない
  {
    const w = await newPage(browser, { viewport: { width: 667, height: 375 } });
    await w.page.goto(URL); await w.page.waitForTimeout(2500);
    await w.page.evaluate(() => NISHIO_MEIRO.open(0));
    const built = await w.page.waitForFunction(() => NISHIO_MEIRO.game && NISHIO_MEIRO.game.board, null, { timeout: 30000 }).then(() => true, () => false);
    let r = { built };
    if (built) {
      await w.page.waitForFunction(() => NISHIO_MEIRO.game.cd <= 0, null, { timeout: 6000 }).catch(() => {});
      await shot(w.page, '07e-meiro-land');
      r = { built, ...await w.page.evaluate(async () => {
        const el = document.getElementById('meiro'), bz = el.querySelector('.mz-bezel').getBoundingClientRect(), bt = [...el.querySelectorAll('.mz-btns button')].map(b => b.getBoundingClientRect());
        const lay = { grid: getComputedStyle(el).display === 'grid', scroll: el.scrollHeight > el.clientHeight + 1, btnsIn: bt.length === 3 && bt.every(q => q.left >= 0 && q.right <= innerWidth && q.bottom <= innerHeight), side: bt.every(q => q.left >= bz.right), boardH: Math.round(bz.height) };
        const g = NISHIO_MEIRO.game, b = g.board, tw = b.tw, sleep = ms => new Promise(f => setTimeout(f, ms));
        const pass = (x, y, dx, dy) => dx === 1 ? x + 1 < tw && b.er[y * tw + x] === 1 : dx === -1 ? x > 0 && b.er[y * tw + x - 1] === 1 : dy === 1 ? y + 1 < b.th && b.ed[y * tw + x] === 1 : y > 0 && b.ed[(y - 1) * tw + x] === 1;
        let c = null;   // 左だけ 開いた 行き止まり
        for (let y = 0; y < b.th && !c; y++) for (let x = 0; x < tw && !c; x++) if (b.cell[y * tw + x] === 1 && !b.holes.has(y * tw + x) && pass(x, y, -1, 0) && !pass(x, y, 1, 0) && !pass(x, y, 0, 1) && !pass(x, y, 0, -1)) c = { x, y };
        if (!c) return { lay, skipped: '行き止まりが ない' };
        const hitAt = async v => { const n0 = g.soft.boings; g.soft.on = false; g.soft.vin = 0; g.x = c.x + (v < 2 ? 0.45 : 0.2); g.y = c.y + 0.5; g.vx = v; g.vy = 0; let dmax = 0, dmin = 0, was = false; for (let i = 0; i < 50; i++) { await sleep(20); dmax = Math.max(dmax, g.soft.dent); dmin = Math.min(dmin, g.soft.dent); if (v < 2 && was && !g.soft.on) { g.vx = g.vy = 0; } was = was || g.soft.on; } return { v, boing: g.soft.boings - n0, dmax: +dmax.toFixed(3), dmin: +dmin.toFixed(3) }; };
        const slow = await hitAt(1), fast = await hitAt(8);
        let spring = null;   // ばねの わざ：ばねの マスへ 置いて とり、強く 当てると 当たった 速さより 速く もどる
        if (b.spring >= 0 && g.spring) {
          g.soft.on = false; g.x = b.spring % tw + 0.5; g.y = ((b.spring / tw) | 0) + 0.5; g.vx = g.vy = 0; await sleep(120);
          const got = g.spring.got, b0 = g.spring.boosts; g.soft.on = false; g.soft.vin = 0; g.x = c.x + 0.25; g.y = c.y + 0.5; g.vx = 5; g.vy = 0;
          let vin = 0, back = 0; for (let i = 0; i < 25; i++) { await sleep(20); vin = Math.max(vin, g.soft.vin); back = Math.min(back, g.vx); }
          g.vx = g.vy = 0; spring = { got, vin: +vin.toFixed(2), back: +(-back).toFixed(2), boosts: g.spring.boosts - b0 };
        }
        return { lay, soft: g.soft ? 'ok' : 'none', slow, fast, spring };
      }) };
      await w.page.evaluate(() => NISHIO_MEIRO.close());
    }
    const L = r.lay || {};
    R.checks.meiroLand = { ...r, ok: built && L.grid && !L.scroll && L.btnsIn && L.side && L.boardH >= 250 && (!!r.skipped || (r.slow.boing === 0 && r.fast.boing >= 1 && r.fast.dmax > 0.05 && r.fast.dmin < 0 && !!r.spring && r.spring.got && r.spring.boosts >= 1 && r.spring.back > r.spring.vin * 1.1 && r.spring.back <= 7.55)) };
    R.errors.push(...w.errors);
    await w.ctx.close();
  }

  // バイラルループの 見た人：めいろの ゴールの シェアの リンク（?play=1&vs=秒&vst=★）から 来た はじめての 人は、すぐ 遊べて、友だちの タイムで さそわれ、
  // はじめての ゴールで 友だちの タイムと ならぶ（1回だけ）
  {
    const w = await newPage(browser);
    await w.ctx.addInitScript(() => {
      window.__toasts = [];
      document.addEventListener('DOMContentLoaded', () => { const el = document.getElementById('toast'); new MutationObserver(() => window.__toasts.push(el.textContent)).observe(el, { childList: true, characterData: true, subtree: true }); });
    });
    await w.page.goto(`${URL}?play=1&vs=83&vst=2&utm_source=share&utm_medium=social&utm_campaign=mzgoal`); await w.page.waitForTimeout(2500);
    const r = await w.page.evaluate(async () => {
      const said = () => window.__toasts.some(t => /友だちは めいろの ゴールまで 1分23秒 ★★/.test(t)) || (nishioGo.toastAfter.q || []).some(t => /友だちは めいろの ゴールまで 1分23秒/.test(t));
      for (let i = 0; i < 16 && !said(); i++) { await new Promise(f => setTimeout(f, 500)); const rw = document.getElementById('reward'); if (rw.classList.contains('show')) rw.click(); document.querySelectorAll('[data-pick-dot]')[0]?.click(); }
      const stored = JSON.parse(localStorage.getItem('nsg_vs') || 'null'), url = location.search;
      const line = nishioGo.friendVs(58, 3), again = nishioGo.friendVs(40, 3);
      const told = () => window.__toasts.some(t => t.includes(line)) || (nishioGo.toastAfter.q || []).includes(line);   // ごほうびの 札では 見えないので 知らせで 出す
      for (let i = 0; i < 16 && line && !told(); i++) { await new Promise(f => setTimeout(f, 500)); const rw = document.getElementById('reward'); if (rw.classList.contains('show')) rw.click(); }
      return { started: document.getElementById('intro').hidden && nishioGo.demo, said: said(), stored, url, line, told: told(), again, left: localStorage.getItem('nsg_vs') };
    });
    await w.page.reload(); await w.page.waitForTimeout(2000);   // 読みこみなおしても もう 出ない（アドレスから vs を のぞいた）
    r.reload = await w.page.evaluate(() => ({ vs: localStorage.getItem('nsg_vs'), url: location.search }));
    R.checks.friendVs = { ...r, ok: r.started && r.said && !!r.stored && r.stored.sec === 83 && r.stored.st === 2 && !/vs=/.test(r.url) && /友だちは 1分23秒 ★★、きみは 58秒 ★★★/.test(r.line) && r.told && !r.again && !r.left && !r.reload.vs && !/vs=/.test(r.reload.url) };
    R.errors.push(...w.errors);
    await w.ctx.close();
  }

  // お米つぶの おはなし（kometalk.js）：はじめて めいろに 入ると、あそびかたの あとで お米つぶが あいさつし、たからばこの あと「つぎは どこへ 行く？」と 聞く。
  // えらんだ 答えで 行き先が かわる。せっていで オフに できる
  {
    const w = await newPage(browser, { howto: true, kome: true });
    await w.page.goto(URL); await w.page.waitForTimeout(1500);
    await w.page.click('#meiroBtn'); await w.page.waitForTimeout(2500);
    const st = () => w.page.evaluate(() => { const b = document.getElementById('komeTalk'); return { open: !!b && !b.hidden, say: b ? b.querySelector('.kt-say').textContent : '', ch: b ? [...b.querySelectorAll('.kt-btn')].map(x => x.textContent) : [], howto: !document.getElementById('howto').hidden }; });
    const s0 = await st();
    const seen = [];
    let ch = [];
    for (let i = 0; i < 40 && !ch.length; i++) {
      await w.page.evaluate(() => { const r = document.getElementById('reward'); if (r.classList.contains('show')) r.click(); document.querySelectorAll('[data-pick-dot]')[0]?.click(); if (!document.getElementById('howto').hidden) document.getElementById('howtoOk').click(); });
      const o = await st();
      if (o.open && o.say && !seen.includes(o.say)) seen.push(o.say);
      if (o.ch.length) { ch = o.ch; break; }
      if (o.open) await w.page.evaluate(() => document.querySelector('#komeTalk .dq').click());
      await w.page.waitForTimeout(900);
    }
    await shot(w.page, '12b-kome-talk');
    const want = ch.length >= 2 ? ch[1].replace(/^\S+\s/, '') : '';
    if (ch.length >= 2) { await w.page.evaluate(() => document.querySelector('#komeTalk .kt-btn[data-kt="1"]').click()); await w.page.waitForTimeout(600); }
    const picked = await w.page.evaluate(() => { const g = nishioGo.state.guide; return g ? g.name : ''; });
    const closed = !(await st()).open;
    const off = await w.page.evaluate(() => { const t = document.getElementById('komeTalkToggle'); t.click(); const r = !nishioKomeTalk.on() && !nishioKomeTalk.say(['テスト']); t.click(); return r && nishioKomeTalk.on(); });
    const hello = /はじめまして/.test(seen[0] || '');
    R.checks.komeTalk = { firstWhileHowto: s0.open && s0.howto, seen, ch, want, picked, closed, off, ok: !(s0.open && s0.howto) && hello && ch.length >= 2 && !!want && picked === want && closed && off };
    await w.ctx.close();
  }
  // あそびかた：はじめて「🌀 傾けて めいろ」を 押した人に 1回だけ 出る。読んでいる 間は お米が 転がらず、「わかった！」で とじると 転がる。2回目は 出ない。せっていから もう一度 見られる
  {
    const w = await newPage(browser, { howto: true });
    await w.page.goto(URL); await w.page.waitForTimeout(1500);
    const sub = await w.page.evaluate(() => { const s = document.querySelector('#meiroBtn small.mp-s'); return s && getComputedStyle(s).display !== 'none' ? s.textContent : ''; });
    await w.page.click('#meiroBtn'); await w.page.waitForTimeout(2500);
    const pos = () => w.page.evaluate(() => { const r = nishioPixel.roll; return r.x === null ? null : [r.x, r.y]; });
    const shown = await w.page.evaluate(() => !document.getElementById('howto').hidden);
    const toastOver = await w.page.evaluate(() => { nishioGo.toast('あそびかたの テストの 知らせ'); return document.getElementById('toast').classList.contains('show') && /テストの 知らせ/.test(document.getElementById('toast').textContent); });   // あそびかたの 札の 上に 知らせを 重ねない（とじてから）
    await shot(w.page, '12-howto');
    const p0 = await pos(); await w.page.keyboard.down('ArrowUp'); await w.page.waitForTimeout(900); await w.page.keyboard.up('ArrowUp'); const p1 = await pos();
    await w.page.click('#howtoOk'); await w.page.waitForTimeout(300);
    const closed = await w.page.evaluate(() => document.getElementById('howto').hidden && localStorage.getItem('nsg_howto') === '1');
    await w.page.waitForTimeout(300);
    const toastAfterOk = await w.page.evaluate(() => /テストの 知らせ/.test(document.getElementById('toast').textContent));   // とじたら 出る（ほかの 知らせの あとに なる ことも あるので 記録だけ）
    const unblock = () => w.page.evaluate(() => { const r = document.getElementById('reward'); if (r.classList.contains('show')) r.click(); document.querySelectorAll('[data-pick-dot]')[0]?.click(); const pi = document.getElementById('pxInfo'); if (!pi.hidden) pi.hidden = true; });   // とじたあとに 出る ようこそ たからばこ・はじめの1枚
    const free = async () => { for (let i = 0; i < 3; i++) { await unblock(); await w.page.waitForTimeout(400); await unblock(); const pp = await pos(); await w.page.keyboard.down('ArrowUp'); await w.page.waitForTimeout(700); await w.page.keyboard.up('ArrowUp'); await w.page.waitForTimeout(300); const qq = await pos(); if (pp && qq && Math.hypot(qq[0] - pp[0], qq[1] - pp[1]) > 0.3) return true; await w.page.keyboard.down('ArrowLeft'); await w.page.waitForTimeout(700); await w.page.keyboard.up('ArrowLeft'); const rr = await pos(); if (qq && rr && Math.hypot(rr[0] - qq[0], rr[1] - qq[1]) > 0.3) return true; } return false; };
    const rolls = await free();
    await w.page.reload(); await w.page.waitForTimeout(2500);
    const again = await w.page.evaluate(() => !document.getElementById('howto').hidden);
    const reopen = await w.page.evaluate(() => { document.getElementById('howtoOpen').click(); const ok = !document.getElementById('howto').hidden; document.getElementById('howtoOk').click(); return ok && document.getElementById('howto').hidden; });
    // 読んでいる 間に 来た ごほうびは うしろに 重ならず、とじてから 出る
    await unblock(); await w.page.waitForTimeout(800); await unblock();
    await w.page.evaluate(() => { document.getElementById('howtoOpen').click(); nishioGo.showReward(5, 'あそびかたの テスト', []); });
    await w.page.waitForTimeout(700);
    const heldBack = await w.page.evaluate(() => !document.getElementById('reward').classList.contains('show') && nishioGo.rewardSoon());
    await w.page.click('#howtoOk'); await w.page.waitForTimeout(1500);
    const afterOk = await w.page.evaluate(() => document.getElementById('reward').classList.contains('show') && /あそびかたの テスト/.test(document.getElementById('reward').textContent));
    // めいろの おたすけ：はじめての人は 自動で オン（道しるべの 線と 行き止まりの ✕）。せっていで オフ、ゴール 3回で 自動は おしまい
    await unblock(); await w.page.waitForTimeout(2500);
    const helpA = await w.page.evaluate(() => nishioPixel.maze.help());
    const helpB = await w.page.evaluate(async () => { const t = document.getElementById('mzHelpToggle'); const was = t.checked; t.checked = false; t.dispatchEvent(new Event('change')); await new Promise(r => setTimeout(r, 400)); const off = nishioPixel.maze.help(); t.checked = true; t.dispatchEvent(new Event('change')); await new Promise(r => setTimeout(r, 400)); const on = nishioPixel.maze.help(); localStorage.removeItem('nsg_mzhelp'); localStorage.setItem('nsg_mzgoals', '3'); await new Promise(r => setTimeout(r, 400)); const auto3 = nishioPixel.maze.help(); localStorage.setItem('nsg_mzgoals', '0'); return { was, off, on, auto3 }; });
    R.checks.mzHelp = { helpA, ...helpB, ok: helpA.on && helpA.dots > 0 && helpB.was && !helpB.off.on && helpB.off.dots === 0 && helpB.off.dead === 0 && helpB.on.on && !helpB.auto3.on };
    // めいろの カラス：うろうろ 動き、お米の となりに 来ると はじいて 時計が すすむ。せっていで オフに すると いなくなる
    const crowA = await w.page.evaluate(async () => {
      const M = nishioPixel.maze, r = nishioPixel.roll, K = M.K, a = Math.floor(r.x / K), b = Math.floor(r.y / K);
      for (let i = 0; i < 20 && !M.crows().list.length; i++) await new Promise(res => setTimeout(res, 300));   // 1羽 出るまで
      const before = M.crows().list.map(c => [c.cx, c.cy, c.t]);
      await new Promise(res => setTimeout(res, 1500));
      const moved = M.crows().list.some((c, i) => before[i] && (c.cx !== before[i][0] || c.cy !== before[i][1] || Math.abs(c.t - before[i][2]) > 0.05));
      const h0 = M.crows().hits, s0 = M.clock() ? M.clock().sec : 0;
      M.crowPut(a, b);   // お米の マスに 1羽（すぐ 当たる）
      await new Promise(res => setTimeout(res, 600));
      const h1 = M.crows().hits, s1 = M.clock() ? M.clock().sec : 0;
      const t = document.getElementById('mzCrowToggle'); t.checked = false; t.dispatchEvent(new Event('change'));
      await new Promise(res => setTimeout(res, 300));
      const offN = M.crows().list.length, offOn = M.crows().on;
      // おたすけ中は 1羽：3羽 いる ところで おたすけに すると 1羽に へる
      localStorage.setItem('nsg_mzgoals', '3'); t.checked = true; t.dispatchEvent(new Event('change'));
      for (let i = 0; i < 25 && M.crows().list.length < 2; i++) await new Promise(res => setTimeout(res, 400));
      const many = M.crows().list.length;
      localStorage.setItem('nsg_mzgoals', '0');
      await new Promise(res => setTimeout(res, 300));
      const helpN = M.crows().list.length;
      return { n: before.length, moved, hit: h1 - h0, jump: Math.round((s1 - s0) * 10) / 10, offN, offOn, many, helpN };
    });
    R.checks.mzCrow = { ...crowA, ok: crowA.n >= 1 && crowA.moved && crowA.hit === 1 && crowA.jump >= 5 && crowA.offN === 0 && !crowA.offOn && crowA.many >= 2 && crowA.helpN <= 1 };
    // かかし：カラスが いると 近くに 立つ。とると カラスが こわがって にげ、さわると おいはらえる（時計は すすまない）。ゴールでは 通った 道の 倍率
    const scareA = await w.page.evaluate(async () => {
      const M = nishioPixel.maze, r = nishioPixel.roll, K = M.K, a = Math.floor(r.x / K), b = Math.floor(r.y / K), wait = ms => new Promise(res => setTimeout(res, ms));
      for (let i = 0; i < 20 && !M.crows().list.length; i++) await wait(300);
      let auto = false;
      for (let i = 0; i < 30 && !auto; i++) { await wait(250); const s = M.scare(); if (s.on) auto = Math.abs(s.cx - a) + Math.abs(s.cy - b) >= 5 && M.type(s.cx, s.cy) === 1; }
      const g0 = M.scare().got;
      M.scarePut(a, b); await wait(400);
      const s1 = M.scare(), scaredAll = M.crows().list.length > 0 && M.crows().list.every(c => c.scared);
      const h0 = M.crows().hits, o0 = M.crows().shoo, c0 = M.clock();
      M.crowPut(a, b); await wait(500);
      const c1 = M.crows(), k1 = M.clock();
      const way = nishioGo.guide ? M.goal(nishioGo.guide.id || nishioGo.guide.name) : null;
      // かかしの 効きめが おわってから、かかしと カラスを 同じ マスに：とった その こまで こわがり、当たらずに おいはらう
      for (let i = 0; i < 40 && M.scare().left > 0; i++) await wait(250);
      const h2 = M.crows().hits, o2 = M.crows().shoo;
      M.scarePut(a, b); M.crowPut(a, b); await wait(400);
      const same = { shoo: M.crows().shoo - o2, hit: M.crows().hits - h2 };
      // まよわず ゴールの 歩数：さかいを 0.4秒 以内に 何度 またいでも 前の 歩数は へらない。ゆっくり 行き来すれば 数える
      const A = [0, 0], B = [1, 0];
      const mv = { jitter: M.mvSim(100, [A, B, A, B, A, B, A, B, A, B], 100), slow: M.mvSim(0, [A, B, A, B, A], 1000), line: M.mvSim(0, [[0, 0], [1, 0], [2, 0], [3, 0]], 100), diag: M.mvSim(0, [[0, 0], [1, 1], [2, 1]], 100), reset: M.mvSim(0, [A, B, 'R', A], 100), diagBack: M.mvSim(0, [[0, 0], [1, 1], [1, 0], [2, 0]], 100) };   // diagBack：ななめの すぐ あとに 片方だけ ひきかえしても、その 1歩は とりけす（0,0→1,0→1,1→1,0→2,0 と 同じ 2歩）   // reset：ゴールが かわった すぐ あとに ひきかえしても 前の 1歩は とりけさない（1歩と 数える）   // diag：1こまに ななめに 2つ こえたら 2歩
      return { auto, got: s1.got - g0, left: Math.round(s1.left), scaredAll, shoo: c1.shoo - o0, hit: c1.hits - h0, jump: c0 && k1 ? Math.round((k1.sec - c0.sec) * 10) / 10 : 0, float: nishioPixel.floats().some(t => /おいはらった/.test(t)), way: way ? way.way : 'no-goal', same, mv };
    });
    R.checks.mzScare = { ...scareA, ok: scareA.auto && scareA.got === 1 && scareA.left > 6500 && scareA.scaredAll && scareA.shoo === 1 && scareA.hit === 0 && scareA.jump < 2 && scareA.float && (scareA.way === 'no-goal' || scareA.way === 0 || scareA.way >= 1) && scareA.same.shoo === 1 && scareA.same.hit === 0 && scareA.mv.jitter >= 100 && scareA.mv.jitter <= 101 && scareA.mv.slow === 4 && scareA.mv.line === 3 && scareA.mv.diag === 3 && scareA.mv.reset === 1 && scareA.mv.diagBack === 2 };
    // ゴールに 着いたら そのまま ゴール：名所は ひとりでに チェックイン（「🏁 ゴール！」）、人は 話しかける（人が ゴールでも「🏁 ゴール！」）
    const arriveA = await w.page.evaluate(async () => {
      const G = nishioGo, M = nishioPixel.maze, wait = ms => new Promise(res => setTimeout(res, ms));
      const clear = () => { const rw = document.getElementById('reward'); if (rw.classList.contains('show')) rw.click(); const pi = document.getElementById('pxInfo'); if (!pi.hidden) pi.hidden = true; document.querySelectorAll('.md-card .md-close').forEach(b => { if (b.getClientRects().length) b.click(); }); };
      const me0 = { lat: G.me.lat, lng: G.me.lng };
      const s = G.spots.filter(x => x.featured && !x.shop && !G.cooldownLeft(x) && G.dist(me0, x) < 1500).sort((a, b) => G.dist(me0, a) - G.dist(me0, b))[0];
      if (!s) return { spot: 'none' };
      G.setGuide({ kind: 'spot', id: s.id, name: s.name, why: 'テスト', by: 'テスト' });
      await wait(3800); clear();
      const v0 = (G.state.visits[s.id] || { n: 0 }).n, b0 = M.banner;
      G.moveTo(s.lat, s.lng);
      let spot = false;
      for (let i = 0; i < 20 && !spot; i++) { await wait(250); if ((G.state.visits[s.id] || { n: 0 }).n === v0 + 1) spot = true; }
      await wait(600); clear(); await wait(800); clear();
      const sb = M.banner !== b0 && /・めいろ|秒/.test(M.banner);
      // 着いた とき 窓が 開いていて、そのまま 2分 ちかく 読んでから とじても、その ゴールで チェックインする（窓の 間は 2分を 止める）
      let held = 'none';
      const s2 = G.spots.filter(x => x.featured && !x.shop && x.id !== s.id && !G.cooldownLeft(x) && G.dist(G.me, x) < 1500).sort((a, b) => G.dist(G.me, a) - G.dist(G.me, b))[0];
      if (s2) {
        G.setGuide({ kind: 'spot', id: s2.id, name: s2.name, why: 'テスト', by: 'テスト' });
        await wait(3800); clear();
        const pi = document.getElementById('pxInfo'), v2 = (G.state.visits[s2.id] || { n: 0 }).n;
        document.getElementById('pxInfoBody').innerHTML = '<p>テストの 窓</p>'; pi.hidden = false;
        G.moveTo(s2.lat, s2.lng); await wait(900);
        const aged = M.prevAge(119000);
        await wait(2000);
        const during = (G.state.visits[s2.id] || { n: 0 }).n === v2;   // 窓の 間は まだ チェックインしない
        pi.hidden = true;
        let got = false;
        for (let i = 0; i < 12 && !got; i++) { await wait(250); clear(); if ((G.state.visits[s2.id] || { n: 0 }).n === v2 + 1) got = true; }   // clear：とちゅうで 出た ごほうびの 窓の 間は チェックインを 待つ 決まりなので、とじる（ときどき 落ちて いた）
        held = { aged, during, got };
        await wait(500); clear(); await wait(600); clear();
      }
      const n = G.npcs.filter(x => G.dist(G.me, x) < 2000).sort((a, b) => G.dist(G.me, a) - G.dist(G.me, b))[0];
      if (!n) return { spot, sb, npc: 'none' };
      for (let i = 0; i < 30 && (G.rewardSoon() || (window.NISHIO_MOVIE && NISHIO_MOVIE.playing)); i++) { await wait(300); clear(); }   // チェックインの あとの ムービー（ごほうびの あとに 流れる）が おわってから
      G.setGuide({ kind: 'npc', id: n.id, name: n.name, why: 'テスト', by: 'テスト' });
      await wait(3800); clear();
      for (let i = 0; i < 30 && !(M.clock() && M.clock().sec > 3.5); i++) { await wait(300); clear(); }   // 窓の 間は 時計が 止まるので、3秒 すすむまで（3秒 より 前の ゴールは 数えない）
      const b1 = M.banner, gt = G.guide, piEl = document.getElementById('pxInfo');
      let talk = false;
      const seen = () => { if (!piEl.hidden && piEl.textContent.includes(n.name)) talk = true; };
      const mo = new MutationObserver(seen); mo.observe(piEl, { attributes: true, attributeFilter: ['hidden'], childList: true, subtree: true });   // 開いて すぐ とじても 見のがさない（速い Mac で 250ms ごとの 見回りの 間に とじて 落ちた）
      G.moveTo(gt.lat, gt.lng);
      for (let i = 0; i < 40 && !talk; i++) {   // 10秒まで。ごほうび・イベントの 窓が 出ると 着いた あつかいが 待つので、それだけ とじる（話の 窓は とじない）
        await wait(250); seen();
        const rw = document.getElementById('reward'); if (rw.classList.contains('show')) rw.click();
        document.querySelectorAll('.md-card .md-close').forEach(b => { if (b.getClientRects().length) b.click(); });
      }
      mo.disconnect();
      await wait(400);
      const nb = M.banner !== b1;
      clear();
      return { spot, sb, held, talk, nb };
    });
    // 「まよわず ゴール」は 文字を 少なく でも 札に 出る（倍率・ボーナス）。「つぎは〜へ」の 行は 出さない
    R.checks.wayChip = await w.page.evaluate(async () => {
      document.body.classList.add('simple');
      nishioGo.showReward(15, 'テストの 名所', ['🏁 めいろ ゴール！ 1分17秒（めいろの 道のり 2.0km）', '★★☆ いいね！ +5', '🧭 まよわず ゴール！（通った 道 1.1倍） +5', '🧭 通った 道は ちかみちの 1.8倍（1.3倍 までなら ボーナス）', '🧭 つぎは どこかへ']);
      await new Promise(r => setTimeout(r, 300));
      const el = document.getElementById('reward'), t = el.innerText, titles = [...el.querySelectorAll('.chips span')].map(x => x.title);
      el.click();
      const goal = /1分17秒/.test(t) && /★★☆/.test(t);   // かかった 時間と ★も 札に
      return { good: /1\.1倍/.test(t) && /\+5/.test(t), bad: /1\.8倍/.test(t), goal, next: titles.some(x => /つぎは/.test(x)), ok: goal && /1\.1倍/.test(t) && /1\.8倍/.test(t) && !titles.some(x => /つぎは/.test(x)) };
    });
    // 当店の ごほうび（文字を少なく）：「来てくれて ありがとう！」を 文で、来店スタンプは 何こめか。数も しるしも ない 札（茶わん・旗だけ）は ならべない
    R.checks.shopThanks = await w.page.evaluate(async () => {
      document.body.classList.add('simple');
      nishioGo.showReward(225, 'らいすぴあ秀幸（永吉）', ['🔗 れんさ ×1.5 +25', '✨ はじめての 名所 +100', '🍚 来店スタンプ 3こめ', '🍚 当店に来てくれてありがとう！', '📱 お店の常連さまポイントも LINE でたまります']);
      await new Promise(r => setTimeout(r, 300));
      const el = document.getElementById('reward'), t = el.innerText, chips = [...el.querySelectorAll('.chips span')].map(x => x.textContent.trim());
      const closePx = parseFloat(getComputedStyle(el.querySelector('.rw'), '::after').fontSize);   // 「タップで とじる」も 読める 大きさ（13点 から）
      el.click();
      const thanks = /来てくれて ありがとう！/.test(t), stamp = chips.includes('3こめ'), blank = chips.filter(x => !x).length;
      return { thanks, stamp, blank, chips, closePx, ok: thanks && stamp && blank === 0 && chips.length === 3 && closePx >= 13 };
    });
    R.checks.mzArrive = { ...arriveA, ok: arriveA.spot === true && arriveA.sb && (arriveA.held === 'none' || (arriveA.held.aged && arriveA.held.during && arriveA.held.got)) && arriveA.talk === true && arriveA.nb };
    // 人から はなれる（テストの 道具）：めいろの 道すじの 上で 人の マスから 5〜8マスの 所に 置き、道すじに そって となりの マスへ 転がす（4マス 以上 はなれた マスに 入る）。
    // 人から まっすぐ 4マス 先は、ゆるい めいろでは 生け垣の 中の ことが あり、置いても 道すじへ もどされて「はなれた」ことに ならなかった
    await w.page.evaluate(() => {
      window.__npcLeave = async t => {
        const P = nishioPixel, M = P.maze, wait = ms => new Promise(res => setTimeout(res, ms));
        const on = (x, y) => { const q = M.near(x + 0.5, y + 0.5); return !!q && q.d < 0.2 && !P.blockedAt(x + 0.5, y + 0.5) && Math.abs(x - t.x) + Math.abs(y - t.y) >= 4; };
        const cands = [];
        for (let y = t.y - 8; y <= t.y + 8; y++) for (let x = t.x - 8; x <= t.x + 8; x++) { const d = Math.abs(x - t.x) + Math.abs(y - t.y); if (d >= 5 && d <= 8 && on(x, y)) cands.push([x, y, d]); }
        cands.sort((a, b) => a[2] - b[2]);
        let tries = 0;
        for (const [x, y] of cands) for (const [ex, ey] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          if (tries >= 6 || !on(x + ex, y + ey) || P.rollBlockedFrom(x + 0.5, y + 0.5, x + ex + 0.5, y + ey + 0.5)) continue;
          tries++;
          P.rollPut(x + 0.5, y + 0.5, ex * 2, ey * 2);
          for (let i = 0; i < 10; i++) {
            await wait(100);
            const r = P.roll; if (Math.floor(r.x) === x + ex && Math.floor(r.y) === y + ey) return true;
            const rw = document.getElementById('reward'); if (rw.classList.contains('show')) rw.click(); document.querySelectorAll('.md-card .md-close').forEach(b => { if (b.getClientRects().length) b.click(); });   // 置いた 所の そばの 名所の ごほうび・本の できごとで 止まった ときは 閉じる
          }
        }
        return false;
      };
    });
    // 人に こつん：傾けた まま 押しつづけても、とじる たびに また 話しかけない（3マス はなれたら また 話せる）
    // 人から はなれて、さいごに 話した 人を わすれさせる（テストの 道具）：4マス 先の 点に 置き、マスが かわるまで 人の ほうへ ゆっくり 転がして 止める
    // （置いて 0.2秒 転がす だけでは マスの さかいを こえない ことが あり、ゲームは マスが かわった ときに わすれるので、わすれなかった：駅前の学生で 落ちた）
    await w.page.evaluate(() => {
      window.__mzForget = async L => {
        const P = nishioPixel, wait = ms => new Promise(res => setTimeout(res, ms));
        P.rollPut(L.far.x, L.far.y, 0, 0); await wait(150);
        const k0 = Math.floor(L.far.x) + ',' + Math.floor(L.far.y);
        P.rollPut(L.far.x, L.far.y, L.dFar.x * 3, L.dFar.y * 3);
        for (let i = 0; i < 12; i++) { await wait(50); const r = P.roll; if (Math.floor(r.x) + ',' + Math.floor(r.y) !== k0) break; }
        await wait(50); const r = P.roll; P.rollPut(r.x, r.y, 0, 0); await wait(100);
      };
    });
    const bumpA = await w.page.evaluate(async () => {
      const G = nishioGo, P = nishioPixel, wait = ms => new Promise(res => setTimeout(res, ms)), pi = document.getElementById('pxInfo');
      // 転がる とちゅうで ごほうび・イベントの 窓が 出たら（名所の そばに 立つ 人：近づく とちゅうで 名所に 着いて ごほうびが 出て、お米が 止まった）、とじて もう一度
      const blockedW = () => document.getElementById('reward').classList.contains('show') || [...document.querySelectorAll('.md-card')].some(c => c.getClientRects().length) || !!(window.NISHIO_MOVIE && NISHIO_MOVIE.playing);
      const unblockW = async () => { for (let i = 0; i < 12 && blockedW(); i++) { const rw = document.getElementById('reward'); if (rw.classList.contains('show')) rw.click(); document.querySelectorAll('.md-card .md-close').forEach(b => { if (b.getClientRects().length) b.click(); }); await wait(300); } };
      const rollTo = async (p, d, v, ms, done) => {
        for (let k = 0; k < 3; k++) {
          await unblockW();
          P.rollPut(p.x, p.y, d.x * v, d.y * v);
          let hit = false;
          for (let t = 0; t < ms; t += 100) { await wait(100); if (done()) return true; if (blockedW()) { hit = true; break; } }
          if (!hit) return false;
        }
        return done();
      };
      // 人に 当たりに いく 道（そばの 点と 人へ 向かう 向き・4マス 先の 点と 向き）。ゆるい めいろでは 道すじの 筒に そって（まっすぐの 5マスは まず ない）、そうで なければ まっすぐ
      const lanes = n => {
        const t = P.npcTile(n), c = { x: t.x + 0.5, y: t.y + 0.5 }, MM = P.maze, out = [];
        const unit = (a, b) => { const l = Math.hypot(b.x - a.x, b.y - a.y) || 1; return { x: (b.x - a.x) / l, y: (b.y - a.y) / l }; };
        const q0 = MM.near ? MM.near(c.x, c.y) : null;
        if (q0) {
          if (q0.d > 1.05) return out;   // 道すじから 遠い 人（こつんの 近さ 1.2マスに とどかない）
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            let p = { x: q0.x, y: q0.y }, d = { x: dx, y: dy };
            const pts = [p];
            for (let i = 0; i < 80 && Math.hypot(p.x - c.x, p.y - c.y) < 5.6; i++) {   // 道すじに そって 0.2マス ずつ（すすんで 道すじへ もどす）
              const q = MM.near(p.x + d.x * 0.2, p.y + d.y * 0.2);
              if (!q || q.d > 0.12) break;   // 道すじから それる（はじめの 向きが 道すじと 直角・道の おわり）。ちがう 道すじへ とびうつらない（生け垣の 向こうの 道へ うつって、押しても 止まった）
              const l = Math.hypot(q.x - p.x, q.y - p.y), K = MM.K, ca = [Math.floor(p.x / K), Math.floor(p.y / K)], cb = [Math.floor(q.x / K), Math.floor(q.y / K)];
              if (l < 0.05) break;
              if ((ca[0] !== cb[0] || ca[1] !== cb[1]) && (Math.abs(cb[0] - ca[0]) + Math.abs(cb[1] - ca[1]) !== 1 || !MM.open(ca[0], ca[1], cb[0] - ca[0], cb[1] - ca[1]))) break;   // とじた さかいを こえない
              d = { x: (q.x - p.x) / l, y: (q.y - p.y) / l }; p = { x: q.x, y: q.y }; pts.push(p);
            }
            const i1 = pts.findIndex(z => Math.hypot(z.x - c.x, z.y - c.y) >= 2.2), L = pts.length - 1;   // こつんの 近さ（1.2マス）の 外から 押す
            if (i1 < 1 || Math.hypot(p.x - c.x, p.y - c.y) < 5.5) continue;   // 遠くの 点は 人から 5.5マス（話した 所から 3マス 以上 はなれて、さいごに 話した 人を わすれる）
            if (out.some(o => Math.hypot(o.far.x - p.x, o.far.y - p.y) < 1)) continue;   // 同じ 道
            if (G.npcs.some(m => m.id !== n.id && pts.some(z => { const u = P.npcTile(m); return Math.hypot(z.x - u.x - 0.5, z.y - u.y - 0.5) < 1.5; }))) continue;   // ほかの 人の そばを 通らない（めいろでは 1.2マス 以内で こつん。駅前の学生への 道の わきに ほかの 人が いて、そこで 止まり、テストが ゆらいだ）
            out.push({ near: pts[i1], dNear: unit(pts[i1], pts[i1 - 1]), far: pts[L], dFar: unit(pts[L], pts[L - 1]) });
          }
          return out;
        }
        for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
          const sx = t.x + dx * 2, sy = t.y + dy * 2;   // 2マス 先から（こつんの 近さ 1.2マスの 外）
          if (P.blockedAt(sx + 0.5, sy + 0.5) || P.blockedAt(sx - dx + 0.5, sy - dy + 0.5) || P.blockedAt(sx - dx * 2 + 0.5, sy - dy * 2 + 0.5)) continue;
          let wall = false;
          for (let k = 4; k > -2 && !wall; k--) if (P.rollBlockedFrom(sx + dx * k + 0.5, sy + dy * k + 0.5, sx + dx * (k - 1) + 0.5, sy + dy * (k - 1) + 0.5)) wall = true;   // 4マス はなれた 所から 人の マスまで 1マスずつ。めいろの 生け垣を はさむ 向きは ためさない
          if (wall) continue;
          out.push({ near: { x: sx + 0.5, y: sy + 0.5 }, dNear: { x: -dx, y: -dy }, far: { x: sx + 0.5 + dx * 4, y: sy + 0.5 + dy * 4 }, dFar: { x: -dx, y: -dy } });
        }
        return out;
      };
      // ゴールを 遠い 名所に して おく（ゴールが ないと、話で 行き先が きまり、とじると その 人が お米を 次の 行き先へ 押して 3マス 以上 はなれ、また 話しかけられる。ゆるい めいろの 筒では よく すべる）
      const far0 = G.spots.filter(x => x.lat && G.dist(G.me, x) > 1500 && G.dist(G.me, x) < 4000)[0];
      const keep = () => G.setGuide(far0 ? { kind: 'spot', id: far0.id, name: far0.name, why: 'テスト', by: 'テスト' } : null);
      keep();
      let tried = 0;
      for (const n of G.npcs.filter(x => G.dist(G.me, x) < 1500)) {
        for (const L of lanes(n)) {
          pi.hidden = true; tried++; await wait(200);   // 前の 話を とじた あとの「次の 行き先へ 押す」が 当てる 瞬間に かさならない ように（ガイドさんに とどかず、ときどき 落ちた）
          const push = async () => { await rollTo(L.near, L.dNear, 4, 800, () => !pi.hidden); return !pi.hidden && pi.textContent.includes(n.name); };
          const leave = async () => { await unblockW(); await window.__mzForget(L); };   // 4マス はなれて もどりかける（さいごに 話した 人を わすれる）
          const first = await push();
          if (!first) continue;
          pi.hidden = true; await wait(200);
          const again = await push();
          const tn = P.npcTile(n);
          let minD = 99;
          const gone = () => { const r2 = P.roll; minD = Math.min(minD, Math.hypot(r2.x - tn.x - 0.5, r2.y - tn.y - 0.5)); return minD < 1.15; };   // こつんの 近さ（1.2マス）の 中まで 止められずに 入った＝すりぬけた
          const dbg = [];
          for (let i = 0; i < 10 && !gone() && pi.hidden; i++) { await wait(100); const r3 = P.roll; dbg.push([+(r3.x - L.near.x).toFixed(2), +(r3.y - L.near.y).toFixed(2), +r3.vx.toFixed(1), +r3.vy.toFixed(1), pi.hidden, P.mapCovered(true), P.sightBusy()]); }   // 遅い 画面でも 待てるよう
          const passed = gone();
          window.__bumpDbg = passed ? null : { L, dbg, floats: P.floats() };   // すりぬけなかった ときの ようす（原因を 追う ため）   // めいろでは あいさつ ずみの 人を すりぬける（止められない）
          pi.hidden = true;
          await leave();
          const back = await push();   // めいろでは、いまの ゴールへ 向かう 間は、はなれて また 通っても 話しかけない
          pi.hidden = true;
          // 人の 話で 決まった ゴールとは べつの 所（話で 決まった ゴールへ 向かう 間は あいさつ ずみの まま）
          const gg = G.guide, far = x => !gg || G.dist(gg, x) > 100;
          const g = [G.decideGuide(null), ...G.spots.filter(s => s.featured && !s.shop && G.dist(G.me, s) < 1500).map(s => ({ kind: 'spot', id: s.id, name: s.name, lat: s.lat, lng: s.lng, why: 'テスト', by: 'テスト' }))].find(x => x && Number.isFinite(x.lat) && far(x)), M = P.maze;
          let fresh = 'skip';
          if (g) {   // ゴールが かわると、また こつんで 話せる
            G.setGuide(g);
            for (let i = 0; i < 20 && !M.routePath(); i++) await wait(150);
            await leave();
            fresh = await push();
            pi.hidden = true;
          }
          G.setGuide(null);
          return { npc: n.name, curve: !!(P.maze.near && P.maze.near(L.near.x, L.near.y)), first, again, passed, minD: +minD.toFixed(2), back, fresh };
        }
      }
      G.setGuide(null);
      return { npc: 'none', tried };   // 当たりに いける 道が あったのに、だれにも こつんと 話しかけられなかった（tried）は 落とす
    });
    R.checks.npcBump = { ...bumpA, dbg: await w.page.evaluate(() => window.__bumpDbg || undefined), ok: (bumpA.npc === 'none' && !bumpA.tried) || (bumpA.first && !bumpA.again && bumpA.passed && !bumpA.back && bumpA.fresh !== false) };
    // めいろの ゴールの 人に 着いて 話した あと、そのまま となりから こつんと 当たっても、同じ 話を もう 一度 開かない。次の ゴールへ 向かう 間は、はなれて また 通っても 開かない（こつんで あいさつした 人と 同じ）。
    // 自分で 遊んで 分かった：着いて 話すと ゴールが 次の 人に かわり、とじて 2秒で 同じ 人の 窓が また 開いた
    R.checks.npcArriveBump = await w.page.evaluate(async () => {
      const G = nishioGo, P = nishioPixel, M = P.maze, wait = ms => new Promise(res => setTimeout(res, ms)), pi = document.getElementById('pxInfo');
      const talking = n => !pi.hidden && pi.textContent.includes(n.name);
      // 転がる とちゅうで ごほうび・イベントの 窓が 出たら（名所の そばに 立つ 人：近づく とちゅうで 名所に 着いて ごほうびが 出て、お米が 止まった）、とじて もう一度
      const blockedW = () => document.getElementById('reward').classList.contains('show') || [...document.querySelectorAll('.md-card')].some(c => c.getClientRects().length) || !!(window.NISHIO_MOVIE && NISHIO_MOVIE.playing);
      const unblockW = async () => { for (let i = 0; i < 12 && blockedW(); i++) { const rw = document.getElementById('reward'); if (rw.classList.contains('show')) rw.click(); document.querySelectorAll('.md-card .md-close').forEach(b => { if (b.getClientRects().length) b.click(); }); await wait(300); } };
      const rollTo = async (p, d, v, ms, done) => {
        for (let k = 0; k < 3; k++) {
          await unblockW();
          P.rollPut(p.x, p.y, d.x * v, d.y * v);
          let hit = false;
          for (let t = 0; t < ms; t += 100) { await wait(100); if (done()) return true; if (blockedW()) { hit = true; break; } }
          if (!hit) return false;
        }
        return done();
      };
      // 人に 当たりに いく 道（そばの 点と 人へ 向かう 向き・4マス 先の 点と 向き）。ゆるい めいろでは 道すじの 筒に そって（まっすぐの 5マスは まず ない）、そうで なければ まっすぐ
      const lanes = n => {
        const t = P.npcTile(n), c = { x: t.x + 0.5, y: t.y + 0.5 }, MM = P.maze, out = [];
        const unit = (a, b) => { const l = Math.hypot(b.x - a.x, b.y - a.y) || 1; return { x: (b.x - a.x) / l, y: (b.y - a.y) / l }; };
        const q0 = MM.near ? MM.near(c.x, c.y) : null;
        if (q0) {
          if (q0.d > 1.05) return out;   // 道すじから 遠い 人（こつんの 近さ 1.2マスに とどかない）
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            let p = { x: q0.x, y: q0.y }, d = { x: dx, y: dy };
            const pts = [p];
            for (let i = 0; i < 80 && Math.hypot(p.x - c.x, p.y - c.y) < 5.6; i++) {   // 道すじに そって 0.2マス ずつ（すすんで 道すじへ もどす）
              const q = MM.near(p.x + d.x * 0.2, p.y + d.y * 0.2);
              if (!q || q.d > 0.12) break;   // 道すじから それる（はじめの 向きが 道すじと 直角・道の おわり）。ちがう 道すじへ とびうつらない（生け垣の 向こうの 道へ うつって、押しても 止まった）
              const l = Math.hypot(q.x - p.x, q.y - p.y), K = MM.K, ca = [Math.floor(p.x / K), Math.floor(p.y / K)], cb = [Math.floor(q.x / K), Math.floor(q.y / K)];
              if (l < 0.05) break;
              if ((ca[0] !== cb[0] || ca[1] !== cb[1]) && (Math.abs(cb[0] - ca[0]) + Math.abs(cb[1] - ca[1]) !== 1 || !MM.open(ca[0], ca[1], cb[0] - ca[0], cb[1] - ca[1]))) break;   // とじた さかいを こえない
              d = { x: (q.x - p.x) / l, y: (q.y - p.y) / l }; p = { x: q.x, y: q.y }; pts.push(p);
            }
            const i1 = pts.findIndex(z => Math.hypot(z.x - c.x, z.y - c.y) >= 2.2), L = pts.length - 1;   // こつんの 近さ（1.2マス）の 外から 押す
            if (i1 < 1 || Math.hypot(p.x - c.x, p.y - c.y) < 5.5) continue;   // 遠くの 点は 人から 5.5マス（話した 所から 3マス 以上 はなれて、さいごに 話した 人を わすれる）
            if (out.some(o => Math.hypot(o.far.x - p.x, o.far.y - p.y) < 1)) continue;   // 同じ 道
            if (G.npcs.some(m => m.id !== n.id && pts.some(z => { const u = P.npcTile(m); return Math.hypot(z.x - u.x - 0.5, z.y - u.y - 0.5) < 1.5; }))) continue;   // ほかの 人の そばを 通らない（めいろでは 1.2マス 以内で こつん。駅前の学生への 道の わきに ほかの 人が いて、そこで 止まり、テストが ゆらいだ）
            out.push({ near: pts[i1], dNear: unit(pts[i1], pts[i1 - 1]), far: pts[L], dFar: unit(pts[L], pts[L - 1]) });
          }
          return out;
        }
        for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
          const sx = t.x + dx * 2, sy = t.y + dy * 2;   // 2マス 先から（こつんの 近さ 1.2マスの 外）
          if (P.blockedAt(sx + 0.5, sy + 0.5) || P.blockedAt(sx - dx + 0.5, sy - dy + 0.5) || P.blockedAt(sx - dx * 2 + 0.5, sy - dy * 2 + 0.5)) continue;
          let wall = false;
          for (let k = 4; k > -2 && !wall; k--) if (P.rollBlockedFrom(sx + dx * k + 0.5, sy + dy * k + 0.5, sx + dx * (k - 1) + 0.5, sy + dy * (k - 1) + 0.5)) wall = true;   // 4マス はなれた 所から 人の マスまで 1マスずつ。めいろの 生け垣を はさむ 向きは ためさない
          if (wall) continue;
          out.push({ near: { x: sx + 0.5, y: sy + 0.5 }, dNear: { x: -dx, y: -dy }, far: { x: sx + 0.5 + dx * 4, y: sy + 0.5 + dy * 4 }, dFar: { x: -dx, y: -dy } });
        }
        return out;
      };
      // reroute：話で 次の ゴールが 決まった あと、動く 前に 行き先を また かえる（その ときは あいさつ ずみを 次の 次の ゴールへ もちこさない＝はなれて もどれば また 話せる）
      const once = async (n, L, reroute) => {
        await unblockW(); await window.__mzForget(L);   // はなれて 前の 確かめの こつんを 忘れさせる（rollPut は マスを かえた あつかいに ならない）
        G.setGuide({ kind: 'npc', id: n.id, name: n.name, why: 'テスト', by: 'テスト' });
        for (let i = 0; i < 20 && !M.routePath(); i++) await wait(150);
        const arrived = await rollTo(L.near, L.dNear, 0, 4000, () => talking(n));   // ゴールの 人の そばに 着く（こつんでは なく、着いて 話す）
        if (!arrived) { pi.hidden = true; G.setGuide(null); return null; }
        pi.hidden = true; await wait(400);
        const moved = !!G.guide && G.guide.id !== n.id;   // 話で 次の ゴールに かわった（次の ゴールへ 向かう 間の ふるまいを 見る）
        let other = '';
        if (reroute) {
          const o = G.npcs.filter(x => x.id !== n.id && (!G.guide || x.id !== G.guide.id)).sort((a, b) => G.dist(G.me, a) - G.dist(G.me, b))[0];
          if (!o) return { skip: true };
          G.setGuide({ kind: 'npc', id: o.id, name: o.name, why: 'テスト', by: 'テスト' }); await wait(600); other = G.guide && G.guide.id === o.id ? o.name : 'no:' + (G.guide && G.guide.id);
        }
        let again = false;
        if (!reroute) {   // reroute の ときは 当たらない（すりぬけた お米が 3マス 先で はね返って また 当たると、そこで あいさつ ずみに なって しまう）
          again = await rollTo(L.near, L.dNear, 4, 600, () => talking(n));   // そのまま そばから 当たる
          pi.hidden = true;
        }
        await unblockW(); await window.__mzForget(L);   // 4マス はなれて（マスを かえて）さいごに 話した 人を わすれる
        let minD = 99;
        const tn = P.npcTile(n);
        const back = await rollTo(L.near, L.dNear, 4, 1500, () => { const r = P.roll; minD = Math.min(minD, Math.hypot(r.x - tn.x - 0.5, r.y - tn.y - 0.5)); return talking(n); });   // そばの 点から もどる（4マス 先から 転がすと、曲がる 道では とちゅうで いきおいが なくなり、人の 2マス 手前で 止まった：駅前の学生）
        pi.hidden = true; G.setGuide(null);
        return { arrived, moved, other, again, back, minD: +minD.toFixed(2) };
      };
      G.setGuide(null); pi.hidden = true;
      const skipped = [];
      for (const n of G.npcs.filter(x => G.dist(G.me, x) < 1500).sort((a, b) => G.dist(G.me, a) - G.dist(G.me, b))) {
        for (const L of lanes(n)) {
          const a = await once(n, L, false);
          if (!a) continue;
          if (a.minD > 1.25) { skipped.push(`${n.name}:${a.minD}`); continue; }   // もどって 押しても 人の そば（こつんの 近さ 1.2マス）まで 届かない 道（人が 道すじから すこし それて 立つ 曲がり角〈駅前の学生〉）では 確かめられない
          const b = await once(n, L, true);
          const okB = !b || b.skip || (b.arrived && !/^no:/.test(b.other) && b.back);
          return { npc: n.name, curve: !!(M.near && M.near(L.near.x, L.near.y)), ...a, reroute: b, skipped, ok: a.moved && !a.again && !a.back && okB };
        }
      }
      return { npc: 'none', skipped, ok: true };
    });
    // めいろで 人の そば（1.2マス）に 入れば、マスが かわらなくても こつんと 話しかける（Codex の 指摘：同じ マスの 中で 近づいて はなれると、まだ あいさつ して いない 人にも 当たれなかった）
    R.checks.npcBumpInTile = await w.page.evaluate(async () => {
      const G = nishioGo, P = nishioPixel, M = P.maze, wait = ms => new Promise(res => setTimeout(res, ms)), pi = document.getElementById('pxInfo');
      if (!M.near) return { npc: 'none', why: 'まっすぐの めいろ', ok: true };
      const used = new Set([G.guide && G.guide.id].filter(Boolean)), out = [], r0 = P.roll;
      for (const n of G.npcs.filter(x => G.dist(G.me, x) < 1500)) {
        if (out.length >= 3) break;
        const t = P.npcTile(n), q = M.near(t.x + 0.5, t.y + 0.5);
        if (!q || q.d > 1.05 || Math.floor(q.x) === t.x && Math.floor(q.y) === t.y) continue;   // 道すじから 1.2マスに とどかない・人の マスの 中
        if (G.npcs.some(m => m.id !== n.id && (u => Math.hypot(q.x - u.x - 0.5, q.y - u.y - 0.5) < 1.6)(P.npcTile(m)))) continue;   // ほかの 人も そば
        const sp = G.spots.find(x => x.lat && !used.has(x.id) && G.dist(G.me, x) > 1500 && G.dist(G.me, x) < 4000);   // ゴールを 新しく（あいさつ ずみを わすれる）
        if (!sp) break;
        used.add(sp.id); G.setGuide({ kind: 'spot', id: sp.id, name: sp.name, why: 'テスト', by: 'テスト' });
        for (let i = 0; i < 20 && !M.routePath(); i++) await wait(150);
        pi.hidden = true; await wait(150);
        const v = { x: (t.x + 0.5 - q.x) / q.d * 0.3, y: (t.y + 0.5 - q.y) / q.d * 0.3 };
        P.rollPut(q.x, q.y, v.x, v.y);   // 人から 1.05マス 以内の 道すじに 置いて、ゆっくり 転がす（0.3マス/秒。マスは かわらない。止まった お米は 動きを 見ない）
        let hit = false;
        for (let i = 0; i < 8 && !hit; i++) { await wait(100); hit = !pi.hidden && pi.textContent.includes(n.name); }
        const r = P.roll;
        out.push({ npc: n.name, d: +q.d.toFixed(2), hit, sameTile: Math.floor(r.x) === Math.floor(q.x) && Math.floor(r.y) === Math.floor(q.y) });
        pi.hidden = true;
      }
      G.setGuide(null); P.rollPut(r0.x, r0.y, 0, 0);   // もとの 所へ（人の そばに のこすと、あとの 項目で こつんと 止まる）
      return { npc: out.length ? out.map(o => o.npc).join('・') : 'none', tries: out, ok: !out.length || out.some(o => o.hit) };
    });
    // 呼びとめられて 話した 人も、こつんと 話した 人と 同じく あいさつ ずみ（そのまま 当たっても・はなれて もどっても 同じ 話を 開かない）
    // （自分で 遊んで 分かった：呼びとめた ゴールの 人の 話を とじると、お米が 次の ゴールへ 押されて その人に 当たり、1.5秒で 同じ 話が また 開いた）
    R.checks.npcSightBump = await w.page.evaluate(async () => {
      const G = nishioGo, P = nishioPixel, M = P.maze, wait = ms => new Promise(res => setTimeout(res, ms)), pi = document.getElementById('pxInfo');
      if (!P.sightCheck || !M.near) return { npc: 'none', why: 'no-api', ok: false };
      const talking = n => !pi.hidden && pi.textContent.includes(n.name);
      const blockedW = () => document.getElementById('reward').classList.contains('show') || !!document.querySelector('.medashi:not([hidden])');
      const unblockW = () => { const rw = document.getElementById('reward'); if (rw.classList.contains('show')) rw.click(); document.querySelectorAll('.medashi:not([hidden]) .md-close').forEach(b => b.click()); };
      const r0 = P.roll, g0 = G.guide, tries = [];
      const near = (n, t) => { const q = M.near(t.x + 0.5, t.y + 0.5); if (!q || q.d > 1.05 || q.d < 0.05) return false; P.rollPut(q.x, q.y, (t.x + 0.5 - q.x) / q.d * 0.3, (t.y + 0.5 - q.y) / q.d * 0.3); return true; };   // 人の そばの 道すじから ゆっくり 人の ほうへ（npcBumpInTile と 同じ 当て方）
      const sp = G.spots.find(x => x.lat && G.dist(G.me, x) > 1500 && G.dist(G.me, x) < 4000);   // 遠い 名所を ゴールに（人の 近くで 着いた あつかいに ならない）
      if (!sp) return { npc: 'none', why: 'no-goal', ok: false };   // ためせなかった ときは 落とす（呼びとめが 動かなく なっても 緑に ならない ように。Codex の 指摘）
      G.setGuide({ kind: 'spot', id: sp.id, name: sp.name, why: 'テスト', by: 'テスト' });
      for (let i = 0; i < 20 && !M.routePath(); i++) await wait(150);
      pi.hidden = true;
      for (const n of G.npcs.filter(x => G.dist(G.me, x) < 1500)) {
        const t = P.npcTile(n), q = M.near(t.x + 0.5, t.y + 0.5);
        if (!q || q.d > 1.05 || q.d < 0.05) continue;   // あとで そばの 道すじから 当てられる 人
        for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
          if ([1, 2, 3].some(k => P.blockedAt(t.x + dx * k + 0.5, t.y + dy * k + 0.5))) continue;
          await window.__npcLeave(t);   // 前の こつんを わすれる
          G.state.met = (G.state.met || []).filter(id => id !== n.id); P.sightForget(n.id);   // まだ 話して いない 人に もどす（呼びとめは はじめての 人だけ）
          for (let i = 0; i < 20 && (blockedW() || P.sightBusy()); i++) { unblockW(); pi.hidden = true; await wait(150); }   // 本の できごと・ごほうび・前の 呼びとめ（お米を 動かした とき ほかの まだ 話して いない 人が 呼びとめる ことも ある）が おわってから
          P.rollPut(t.x + dx * 3 + 0.5, t.y + dy * 3 + 0.5, 0, 0); await wait(100);   // 人の まっすぐ 3マス 先
          if (!P.sightCheck()) { tries.push(n.name + ':' + dx + ',' + dy + ':no-sight' + (blockedW() ? ':win' : '') + (P.sightBusy() ? ':busy' : '')); continue; }
          let called = false;
          for (let i = 0; i < 30 && !called; i++) { await wait(100); called = talking(n); }
          if (!called) { tries.push(n.name + ':' + dx + ',' + dy + ':no-talk'); continue; }
          pi.hidden = true; await wait(400);
          near(n, t);   // そのまま 人に 当たる
          let again = false;
          for (let i = 0; i < 8 && !again; i++) { await wait(100); again = talking(n); }
          pi.hidden = true;
          const left = await window.__npcLeave(t);   // はなれて もどる
          near(n, t);
          let back = false;
          for (let i = 0; i < 8 && !back; i++) { await wait(100); back = talking(n); }
          pi.hidden = true; G.setGuide(g0 || null); P.rollPut(r0.x, r0.y, 0, 0);
          return { npc: n.name, called, again, left, back, ok: !again && left && !back };
        }
      }
      G.setGuide(g0 || null); P.rollPut(r0.x, r0.y, 0, 0);
      return { npc: 'none', tries, ok: false };   // 1人も 呼びとめから 当たるまで ためせなかった
    });
    // ゴールの すぐ そば（まっすぐ 3マス以内）なのに 道のりが とても 長い 所では、生け垣の 戸が ひらいて 近道に なる
    // （自分で 遊んで 分かった：らいすぴあの 店員さんが 生け垣の 向こう 70m に 見えて いるのに、道のりは 900m。2回とも そこで 1分 以上 止まった）
    R.checks.mzGoalGate = await w.page.evaluate(async () => {
      const G = nishioGo, P = nishioPixel, M = P.maze, wait = ms => new Promise(res => setTimeout(res, ms)), pi = document.getElementById('pxInfo');
      if (!M.gates) return { ok: false, why: 'no-api' };
      const K = M.K, r0 = P.roll, g0 = G.guide;
      const bfs = (sx, sy, gx, gy) => {   // めいろの マスで 何歩か（いま 通れる さかいだけ）
        const seen = new Map([[sx + ',' + sy, 0]]), q = [[sx, sy]];
        for (let h = 0; h < q.length && h < 30000; h++) {
          const [x, y] = q[h], d = seen.get(x + ',' + y);
          if (x === gx && y === gy) return d;
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nx = x + dx, ny = y + dy, k = nx + ',' + ny;
            if (seen.has(k) || Math.abs(nx - gx) > 40 || Math.abs(ny - gy) > 40 || M.type(nx, ny) !== 1 || !M.open(x, y, dx, dy)) continue;
            seen.set(k, d + 1); q.push([nx, ny]);
          }
        }
        return Infinity;
      };
      const goals = [...G.npcs.filter(n => G.dist(G.me, n) < 1500).map(n => ({ kind: 'npc', id: n.id, name: n.name })), ...G.spots.filter(s => s.lat && G.dist(G.me, s) < 1500).slice(0, 30).map(s => ({ kind: 'spot', id: s.id, name: s.name }))];
      let pick = null;
      for (const g of goals) {
        G.setGuide({ ...g, why: 'テスト', by: 'テスト' });
        const t = G.guide && P.toTile(G.guide.lat, G.guide.lng);
        if (!t) continue;
        const gc = Math.floor(t.x / K), gr = Math.floor(t.y / K);
        if (M.type(gc, gr) !== 1) continue;
        for (let dy = -2; dy <= 2 && !pick; dy++) for (let dx = -2; dx <= 2 && !pick; dx++) {
          const man = Math.abs(dx) + Math.abs(dy);
          if (man < 2 || M.type(gc + dx, gr + dy) !== 1) continue;
          const d = bfs(gc + dx, gr + dy, gc, gr);
          if (d < Infinity && d >= man * 4 + 14) pick = { g, gc, gr, cx: gc + dx, cy: gr + dy, man, d };
        }
        if (pick) break;
      }
      if (!pick) { G.setGuide(g0 || null); return { ok: true, skipped: 'no-far-goal' }; }
      G.setGuide({ ...pick.g, why: 'テスト', by: 'テスト' });
      const n0 = M.gates().length, q = M.near((pick.cx + 0.5) * K, (pick.cy + 0.5) * K) || { x: (pick.cx + 0.5) * K, y: (pick.cy + 0.5) * K };
      pi.hidden = true;
      P.rollPut(q.x, q.y, 0, 0);
      let opened = 0, cells = null;
      for (let i = 0; i < 30; i++) { await wait(150); opened = M.gates().length - n0; const r = M.route(); cells = r ? r.cells : null; if (opened && cells !== null && cells <= pick.man * 2 + 6) break; }
      const after = bfs(pick.cx, pick.cy, pick.gc, pick.gr);
      G.setGuide(g0 || null); P.rollPut(r0.x, r0.y, 0, 0); pi.hidden = true;
      return { goal: pick.g.name, man: pick.man, before: pick.d, after, opened, cells, ok: opened > 0 && opened <= 3 && after <= pick.man * 2 + 4 && cells !== null && cells <= pick.man * 2 + 6 };
    });
    // どの 地面・転がり方でも、少し（約12度）傾ければ 動きだす。「ぴたっ」（ころがり抵抗 2.4倍）で 草の 上では 14度、砂浜では いくら 傾けても 動かなかった（めいろで「詰まって 動かない」）
    R.checks.rollStartTilt = await w.page.evaluate(async () => {
      const G = nishioGo, P = nishioPixel, KS = window.NISHIO_KOROSTYLE, M = P.maze, wait = ms => new Promise(res => setTimeout(res, ms));
      G.setGuide(null); document.getElementById('pxInfo').hidden = true;
      const r0 = P.roll, K = M.K, a = Math.floor(r0.x / K), b = Math.floor(r0.y / K);
      let spot = null;
      for (let d = 0; d < 8 && !spot; d++) for (let cy = b - d; cy <= b + d && !spot; cy++) for (let cx = a - d; cx <= a + d && !spot; cx++) {
        if (Math.max(Math.abs(cx - a), Math.abs(cy - b)) !== d || M.type(cx, cy) !== 1) continue;
        for (let ty = 0; ty < K && !spot; ty++) for (let tx = 0; tx < K && !spot; tx++) {
          const x = cx * K + tx + 0.5, y = cy * K + ty + 0.5;
          P.rollPut(x, y, 0, 0); await wait(60);
          if (P.roll.ground === 'grass' && P.roll.slope && P.roll.slope.g < 0.02) spot = { x, y };
        }
      }
      if (!spot) return { skip: 'no grass', ok: true };
      const id = KS.list().findIndex(c => c.motion.name === 'ぴたっ'), st = KS.state, sel0 = st.sel, had = st.u.includes(id);
      if (!had) st.u.push(id);
      KS.select(id);
      const tg = P.meiroApi.tilt(), res = {};
      for (const [k, dx, dy] of [['r', 1, 0], ['l', -1, 0], ['d', 0, 1], ['u', 0, -1]]) {
        P.rollPut(spot.x, spot.y, 0, 0); await wait(100);
        tg.x = dx * 0.5; tg.y = dy * 0.5;   // 傾き 約12度（0.5 ＝ いちばん強い 傾きの 半分の 押す力）
        await wait(1200);
        const r = P.roll; res[k] = +Math.hypot(r.x - spot.x, r.y - spot.y).toFixed(2);
        tg.x = tg.y = 0;
      }
      if (!had) st.u.splice(st.u.indexOf(id), 1);
      KS.select(sel0);
      const best = Math.max(...Object.values(res));
      return { spot, style: 'ぴたっ', moved: res, ok: best > 0.5 };
    });
    // 遠い ゴール（まっすぐ 1km より 先）：縁の 矢印を タップすると、せかいちずが お米と ゴールの 両方 入る ように 開き、🏁 と 名前の 札が 出る
    // （運営者の声「ゴールがどこなのかわからない」：遠くて 地図の どこか 分からない。めいろ図は こまかすぎて 町の どこか 分からなかった）
    // 小さい 画面（320×568）で、南の ゴール（下の 案内の 札に かくれやすい）と 長い 名前（札が はしで 切れやすい）でも、🏁 は 見えている 所に、札は 画面の 中に（Codex の 指摘）
    R.checks.mzFarWorld = await (async () => {
      const vp = w.page.viewportSize();
      await w.page.setViewportSize({ width: 320, height: 568 }); await w.page.waitForTimeout(400);
      const r = await w.page.evaluate(async () => {
        const G = nishioGo, P = nishioPixel, M = P.maze, wait = ms => new Promise(res => setTimeout(res, ms)), cv = document.getElementById('pxCanvas');
        document.getElementById('pxInfo').hidden = true;
        const far = G.spots.filter(x => x.lat && x.lat < G.me.lat && G.dist(G.me, x) > 2000 && G.dist(G.me, x) < 4000).sort((a, b) => a.lat - b.lat)[0];   // いちばん 南
        if (!far) return { skip: 'no far spot', ok: true };
        const name = far.name + '（' + 'とても長い名前のテスト'.repeat(4) + '）';
        G.setGuide({ kind: 'spot', id: far.id, name, why: 'テスト', by: 'テスト' });
        let a = null;
        for (let i = 0; i < 30 && !a; i++) { await wait(200); a = M.mapArrow; const rw = document.getElementById('reward'); if (rw.classList.contains('show')) rw.click(); }
        if (!a) { G.setGuide(null); return { far: far.name, arrow: null, ok: false }; }
        const rc = cv.getBoundingClientRect(), dpr = cv.width / rc.width;
        cv.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: rc.left + (a[0] + a[2]) / 2 / dpr, clientY: rc.top + (a[1] + a[3]) / 2 / dpr }));
        await wait(800);
        const sh = document.getElementById('sheet').getBoundingClientRect(), visBottom = (Math.min(rc.bottom, sh.top) - rc.top) * dpr;
        const world = document.body.classList.contains('pxw'), g = M.worldGoal, tag = g && g[2];
        const inView = !!g && g[0] > 0 && g[1] > 0 && g[0] < cv.width && g[1] < visBottom, tagIn = !!tag && tag[0] >= 0 && tag[2] <= cv.width && tag[1] >= 0;
        if (world) document.getElementById('pxWorld').click();
        await wait(300);
        G.setGuide(null);
        return { far: far.name, m: Math.round(G.dist(G.me, far)), world, goal: g && g.slice(0, 2), visBottom: Math.round(visBottom), tag, w: cv.width, inView, tagIn, ok: world && inView && tagIn };
      });
      await w.page.setViewportSize(vp); await w.page.waitForTimeout(400);
      return r;
    })();
    // 知らせ（トースト）と ごほうびの 名前は、ことばの 間の すきまで 折りかえす（320px）。長すぎる 文は 画面から はみ出さない
    // （自分で 遊んで 分かった：「🎁 すぐ近くに たからば／こ！」「はじめての たから／ばこ」と ことばの とちゅうで 切れていた）
    R.checks.wrapWords320 = await (async () => {
      const vp = w.page.viewportSize();
      await w.page.setViewportSize({ width: 320, height: 568 }); await w.page.waitForTimeout(400);
      const r = await w.page.evaluate(async () => {
        const wait = ms => new Promise(res => setTimeout(res, ms));
        const lineOf = (el, i) => { const rg = document.createRange(); rg.setStart(el.firstChild, i); rg.setEnd(el.firstChild, i + 1); const rc = rg.getClientRects()[0]; return rc ? Math.round(rc.top) : null; };
        const sameLine = (el, word) => { const t = el.textContent, i = t.indexOf(word); return lineOf(el, i) === lineOf(el, i + word.length - 1); };
        const t = document.getElementById('toast'), keep = { text: t.textContent, show: t.classList.contains('show') };
        t.textContent = '🎁 すぐ近くに たからばこ！'; t.classList.add('show'); await wait(50);
        const toast = sameLine(t, 'たからばこ') && lineOf(t, 0) !== lineOf(t, t.textContent.length - 1);   // 2行に なって いて、たからばこ は 切れない
        t.textContent = 'ＡＢＣＤＥＦＧＨＩＪＫＬＭＮＯＰＱＲＳＴＵＶＷＸＹＺあいうえおかきくけこさしすせそ'; await wait(50);
        const longIn = t.getBoundingClientRect().right <= innerWidth && t.scrollWidth <= t.clientWidth + 1;
        t.textContent = keep.text; t.classList.toggle('show', keep.show);
        const box = document.createElement('div'); box.className = 'reward show'; box.style.cssText = 'visibility:hidden;pointer-events:none';
        box.innerHTML = '<div class="rw hero long"><div class="place">ようこそ！ はじめての たからばこ</div></div>'; document.body.appendChild(box); await wait(50);
        const place = sameLine(box.querySelector('.place'), 'たからばこ'); box.remove();
        return { toast, longIn, place };
      });
      await w.page.setViewportSize(vp); await w.page.waitForTimeout(400);
      return { ...r, ok: r.toast && r.longIn && r.place };
    })();
    // はじめの1枚（3枚から えらぶ）の 窓：320px の 画面でも 3枚とも 窓の 中に 入る
    // （自分で 遊んで 分かった：絵が 84px 固定で 3枚が 窓より 広く なり、まん中 寄せの まま 左右が 切れて、左の 絵は スクロールでも 見られなかった）
    R.checks.pickFit320 = await (async () => {
      const vp = w.page.viewportSize();
      await w.page.setViewportSize({ width: 320, height: 568 }); await w.page.waitForTimeout(400);
      const r = await w.page.evaluate(async () => {
        const wait = ms => new Promise(res => setTimeout(res, ms)), info = document.getElementById('pxInfo'), body = document.getElementById('pxInfoBody');
        const keep = { hidden: info.hidden, html: body.innerHTML }, D = window.NISHIO_DOTS;
        const card = id => `<button type="button"><img src="${D.dataUrl(id)}" alt="" width="96" height="96"/><span>炭火のかば焼き</span></button>`;
        body.innerHTML = `<div class="pick-first"><h4>はじめの1枚を えらぼう</h4><p>えらんだ絵が、西尾ドット絵帳の1枚目になります</p><div class="pick3">${[1, 2, 3].map(card).join('')}</div></div>`;
        info.hidden = false; await wait(200);
        const row = body.querySelector('.pick3'), rr = row.getBoundingClientRect(), W = innerWidth;
        const btns = [...row.children].map(c => { const q = c.getBoundingClientRect(); return [Math.round(q.left), Math.round(q.right)]; });
        const res = { row: [Math.round(rr.left), Math.round(rr.right)], sw: row.scrollWidth, cw: row.clientWidth, btns, inside: btns.every(([l, rt]) => l >= rr.left - 0.5 && rt <= rr.right + 0.5 && l >= 0 && rt <= W) };
        body.innerHTML = keep.html; info.hidden = keep.hidden;
        return res;
      });
      await w.page.setViewportSize(vp); await w.page.waitForTimeout(400);
      return { ...r, ok: r.inside && r.sw <= r.cw };
    })();
    // スマホを 横に した 低い 画面（568×320）でも、はじめの1枚の 3枚が 見えて えらべ、ごほうびの 窓が 画面に 入る
    // （自分で 遊んで 分かった：3枚が 下の パネルの うしろに かくれ、ごほうびの 窓は 上下に はみ出して 名前と「シェア」が 切れていた）
    R.checks.landscape568 = await (async () => {
      const vp = w.page.viewportSize();
      await w.page.setViewportSize({ width: 568, height: 320 }); await w.page.waitForTimeout(500);
      const r = await w.page.evaluate(async () => {
        const wait = ms => new Promise(res => setTimeout(res, ms)), info = document.getElementById('pxInfo'), body = document.getElementById('pxInfoBody'), D = window.NISHIO_DOTS, H = innerHeight;
        const keep = { hidden: info.hidden, html: body.innerHTML };
        const card = id => `<button type="button"><img src="${D.dataUrl(id)}" alt="" width="96" height="96"/><span>炭火のかば焼き</span></button>`;
        body.innerHTML = `<div class="pick-first"><h4>はじめの1枚を えらぼう</h4><p>えらんだ絵が、西尾ドット絵帳の1枚目になります</p><div class="pick3">${[1, 2, 3].map(card).join('')}</div></div>`;
        info.hidden = false; await wait(250);
        const dq = info.querySelector('.dq'), dr = dq.getBoundingClientRect(), sh = document.getElementById('sheet'), shown = sh && sh.getClientRects().length ? sh.getBoundingClientRect().top : H;
        const cards = [...body.querySelectorAll('.pick3 button')].map(b => { const q = b.getBoundingClientRect(); return [Math.round(q.top), Math.round(q.bottom)]; });
        const pickOk = cards.every(([t, b]) => t >= dr.top && b <= dr.bottom + 0.5 && b <= shown + 0.5 && b <= H);
        body.innerHTML = keep.html; info.hidden = keep.hidden; await wait(150);
        const rw = document.getElementById('reward'), rkeep = { cls: rw.className, html: rw.innerHTML };
        rw.innerHTML = `<div class="rw hero long" style="animation:none"><span class="ribbon">NEW</span><div class="place">ようこそ！ はじめての たからばこ</div><div class="frame"><img class="dot-card" src="${D.dataUrl(1)}" alt="" width="192" height="192"/></div><div class="stars"><i></i><i></i><i></i><i></i></div><div class="banner">名鉄の電車</div><div class="sub"><b>+30</b></div><div class="chips"><span>+1</span><span>1km</span></div><button type="button" class="btn mini rw-share">📣 シェア</button></div>`;
        rw.classList.add('show'); await wait(150);
        const q = rw.querySelector('.rw').getBoundingClientRect(), rib = rw.querySelector('.ribbon').getBoundingClientRect();
        const reward = [Math.round(q.top), Math.round(q.bottom)], rewardOk = q.top >= 0 && q.bottom <= H && rib.top >= 0;
        rw.className = rkeep.cls; rw.innerHTML = rkeep.html;
        return { H, cards, dq: [Math.round(dr.top), Math.round(dr.bottom)], sheetTop: Math.round(shown), pickOk, reward, rewardOk };
      });
      await w.page.setViewportSize(vp); await w.page.waitForTimeout(400);
      return { ...r, ok: r.pickOk && r.rewardOk };
    })();
    // きろくの いちばん 上の「ミニゲーム にしおジャンプ」の 札は、ほかの 札と 同じ 幅で「あそぶ」が 札の 中（320px）
    // （自分で 遊んで 分かった：見出しの「📣 シェア」の うかせた ボタンを よけて 札が 細く なり、「あそぶ」が 札の 外に 出ていた）
    R.checks.jumpCard320 = await (async () => {
      const vp = w.page.viewportSize();
      await w.page.setViewportSize({ width: 320, height: 568 }); await w.page.waitForTimeout(400);
      const r = await w.page.evaluate(async () => {
        const G = nishioGo, wait = ms => new Promise(res => setTimeout(res, ms));
        G.openTab('log'); await wait(400);
        const cards = [...document.querySelectorAll('#panel-log .jump-card')].map(c => { const q = c.getBoundingClientRect(), b = c.querySelector('button').getBoundingClientRect(); return { w: Math.round(q.width), right: Math.round(q.right), btnRight: Math.round(b.right) }; });
        const tn = [...document.querySelector('#panel-log .jump-card p b').childNodes].find(n => n.nodeType === 3 && /にしおジャンプ/.test(n.textContent)), word = 'にしおジャンプ';
        const top = i => { const rg = document.createRange(); rg.setStart(tn, i); rg.setEnd(tn, i + 1); const rc = rg.getClientRects()[0]; return rc ? Math.round(rc.top) : null; };
        const wi = tn ? tn.textContent.indexOf(word) : -1, titleOne = wi >= 0 && top(wi) === top(wi + word.length - 1);   // 題の「にしおジャンプ」が 1行に
        G.openTab('map'); await wait(300);
        return { cards, titleOne };
      });
      await w.page.setViewportSize(vp); await w.page.waitForTimeout(400);
      const ws = r.cards.map(c => c.w);
      return { ...r, ok: r.cards.length >= 2 && Math.max(...ws) - Math.min(...ws) <= 1 && r.cards.every(c => c.btnRight <= c.right) && r.titleOne };
    })();
    // せっていの「🔑 ひきつぎの あいことば」は、ほかの せっていと 同じく 見出しの 下に 説明（見出しの すぐ うしろに 説明が つづいて いた）
    R.checks.codeCardHead = await w.page.evaluate(async () => {
      const G = nishioGo, wait = ms => new Promise(res => setTimeout(res, ms));
      G.openTab('settings'); await wait(300);
      const b = document.querySelector('#codeCard > p b'), sm = document.querySelector('#codeCard > p small');
      const res = b && sm ? { bBottom: Math.round(b.getBoundingClientRect().bottom), smTop: Math.round(sm.getBoundingClientRect().top), smLeft: Math.round(sm.getBoundingClientRect().left), bLeft: Math.round(b.getBoundingClientRect().left) } : { missing: true };
      G.openTab('map'); await wait(300);
      return { ...res, ok: !res.missing && res.smTop >= res.bBottom - 1 && Math.abs(res.smLeft - res.bLeft) <= 1 };
    });
    // きろくの バッジは 320px の 画面でも 3列が 同じ 幅で、画面から はみ出さない
    // （自分で 遊んで 分かった：1fr の 列が 長い 名前で ひろがり、88・92・111px に なって 右の 列の 枠が 画面の 外に 切れていた）
    R.checks.badgeGrid320 = await (async () => {
      const vp = w.page.viewportSize();
      await w.page.setViewportSize({ width: 320, height: 568 }); await w.page.waitForTimeout(400);
      const r = await w.page.evaluate(async () => {
        const G = nishioGo, wait = ms => new Promise(res => setTimeout(res, ms));
        G.openTab('log'); await wait(400);
        const g = document.getElementById('badgeGrid'), cols = getComputedStyle(g).gridTemplateColumns.split(' ').map(parseFloat);
        const W = innerWidth, out = [...g.children].filter(c => { const q = c.getBoundingClientRect(); return q.right > W + 0.5 || q.left < -0.5; }).length;
        const res = { n: g.children.length, cols: cols.map(Math.round), spread: Math.round(Math.max(...cols) - Math.min(...cols)), sw: g.scrollWidth, cw: g.clientWidth, out };
        G.openTab('map'); await wait(300);
        return res;
      });
      await w.page.setViewportSize(vp); await w.page.waitForTimeout(400);
      return { ...r, ok: r.n > 0 && r.spread <= 1 && r.sw <= r.cw && r.out === 0 };
    })();
    // めいろで 名所の そばを 通ると 出る 名所の 札（#spinBtn）は 1行：小さい 画面（320×568）でも 下の 欄が 札の ぶん 大きく のびない。名前と 文が 長くても はみ出さない
    // （自分で 遊んで 分かった：札が 2行の 高さ（68px）で、出る たびに 下の 欄が 76px→152px、めいろの 見える 所が 372px→296px に へって いた）
    R.checks.spinCompact = await (async () => {
      const vp = w.page.viewportSize();
      await w.page.setViewportSize({ width: 320, height: 568 }); await w.page.waitForTimeout(400);
      const r = await w.page.evaluate(async () => {
        const wait = ms => new Promise(res => setTimeout(res, ms)), sh = document.getElementById('sheet'), sp = document.getElementById('spinBtn');
        const nm = document.getElementById('spinName'), sub = document.getElementById('spinSub'), keep = { hidden: sp.hidden, nm: nm.innerHTML, sub: sub.innerHTML };
        sp.hidden = true; await wait(100);
        const h0 = sh.offsetHeight;
        sp.hidden = false; nm.textContent = '名鉄 西尾駅'; sub.textContent = '+20'; await wait(100);
        const h1 = sh.offsetHeight, spinH = sp.offsetHeight;
        nm.textContent = '尚古荘'; sub.textContent = 'タップして +20pt（初訪問ボーナスあり）'; await wait(100);
        const shortName = nm.scrollWidth <= nm.clientWidth + 1;   // 短い 名前は 長い 下の 文に おされて 縮まない（「…」に ならない。Codex の 指摘）
        nm.textContent = '西尾市歴史公園（西尾城跡）とても長い名前のテスト'; sub.textContent = 'あと 20m・今日は もう チェックインずみ'; await wait(100);
        const rb = sp.getBoundingClientRect(), over = [nm, sub].some(e => { const q = e.getBoundingClientRect(); return q.right > rb.right + 1 || q.left < rb.left - 1; }), spinH2 = sp.offsetHeight;
        sp.hidden = keep.hidden; nm.innerHTML = keep.nm; sub.innerHTML = keep.sub;
        return { px: document.body.classList.contains('px'), h0, h1, spinH, spinH2, over, shortName };
      });
      await w.page.setViewportSize(vp); await w.page.waitForTimeout(400);
      return { ...r, ok: r.px && r.spinH <= 44 && r.spinH2 <= 44 && r.h1 - r.h0 <= 52 && !r.over && r.shortName };
    })();
    // シェアの 窓の 上に 知らせを 重ねない：開いて いる 間は 待たせて、とじたら 出す（自分で 遊んで 分かった：知らせが シェアする 絵の 上に 重なって いた）
    R.checks.shareToast = await w.page.evaluate(async () => {
      const G = nishioGo, wait = ms => new Promise(res => setTimeout(res, ms)), sh = document.getElementById('share'), el = document.getElementById('toast'), msg = '🎁 テストの 知らせ（シェア）';
      const keep = sh.hidden;
      sh.hidden = false; await wait(100);
      G.toast(msg); await wait(300);
      const over = el.classList.contains('show') && el.textContent === msg;
      sh.hidden = true;
      for (let i = 0; i < 40 && !(el.classList.contains('show') && el.textContent === msg); i++) await wait(200);   // ほかの 知らせが 出て いれば その あと（8秒まで）
      const after = el.classList.contains('show') && el.textContent === msg;
      el.classList.remove('show');
      // 窓 自身の 操作の 結果（コピー）は 待たせず 窓の 中に 出す（Codex の 指摘：知らせだけで 伝えて いたので、とじるまで 分からなかった）
      sh.hidden = false; await wait(100);
      const cb = navigator.clipboard, keepW = cb && cb.writeText;
      if (cb) cb.writeText = () => Promise.resolve();   // 見えない ブラウザでは コピーの 許可を 待って もどらない ことが ある（結果の 出し方だけ 見る）
      const cp = sh.querySelector('[data-share="copy"]'); if (cp) cp.click();
      let inMsg = '';
      for (let i = 0; i < 20 && !inMsg; i++) { await wait(100); const m = document.getElementById('shareMsg'); inMsg = m && !m.hidden ? m.textContent : ''; }
      if (cb) cb.writeText = keepW;
      sh.hidden = keep; el.classList.remove('show');
      return { over, after, inMsg, ok: !over && after && /コピー/.test(inMsg) };
    });
    // イベントの 窓（.medashi：古い地図・虫の名前あて・本のできごと など）の 上に 知らせを 重ねない：開いて いる 間は 待たせ、とじたら 出す
    // （自分で 遊んで 分かった：古い地図の 窓の 写真の 上に 知らせが 重なった）
    R.checks.eventToast = await w.page.evaluate(async () => {
      const G = nishioGo, wait = ms => new Promise(res => setTimeout(res, ms)), el = document.getElementById('toast'), msg = '🎁 テストの 知らせ（イベント）';
      const ev = document.createElement('div'); ev.className = 'medashi'; ev.setAttribute('role', 'dialog'); ev.hidden = true; ev.innerHTML = '<div class="md-card">テストの イベント</div>';
      document.body.appendChild(ev); el.classList.remove('show');
      ev.hidden = false; await wait(100);
      G.toast(msg); await wait(300);
      const over = el.classList.contains('show') && el.textContent === msg;
      ev.hidden = true;
      let after = false;
      for (let i = 0; i < 40 && !after; i++) { await wait(200); after = el.classList.contains('show') && el.textContent === msg; }   // ほかの 知らせが 出て いれば その あと（8秒まで）
      ev.remove(); el.classList.remove('show');
      return { over, after, ok: !over && after };
    });
    // 「めいろ、どうだった？」の ひとことの 欄：320px でも 「ひとこと（なくてOK）」が 切れずに 入り、ボタンも 札の 中（自分で 遊んで 分かった：欄が 縮んで「ひとこと（な」と 切れていた）
    R.checks.playMore320 = await (async () => {
      const vp = w.page.viewportSize();
      await w.page.setViewportSize({ width: 320, height: 568 }); await w.page.waitForTimeout(400);
      const r = await w.page.evaluate(async () => {
        const G = nishioGo, wait = ms => new Promise(res => setTimeout(res, ms)), bar = document.getElementById('reactBar');
        localStorage.removeItem('nsg_play_ask'); document.getElementById('pxInfo').hidden = true;
        G.playAsk({ sec: 61, stars: 3, name: 'テスト' }); G.playShow(); await wait(200);
        if (bar.hidden) return { shown: false };
        bar.querySelector('.play-more').hidden = false; const sb = bar.querySelector('[data-play-share]'); if (sb) sb.hidden = false; await wait(200);   // ★5 を えらんだ ときの 形（★は えらばない：とじる ときに 声を 送らない）
        const inp = document.getElementById('playText'), cs = getComputedStyle(inp), c = document.createElement('canvas').getContext('2d');
        c.font = `${cs.fontSize} ${cs.fontFamily}`;
        const need = Math.ceil(c.measureText(inp.placeholder).width), room = inp.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
        const b = bar.getBoundingClientRect(), out = [...bar.querySelectorAll('.play-more > *')].filter(e => e.getClientRects().length).some(e => { const q = e.getBoundingClientRect(); return q.right > b.right - 1 || q.left < b.left + 1; });
        const share = !!bar.querySelector('[data-play-share]:not([hidden])');
        bar.querySelector('[data-play-x]').click(); localStorage.removeItem('nsg_play_ask');
        return { shown: true, need, room: Math.floor(room), out, share };
      });
      await w.page.setViewportSize(vp); await w.page.waitForTimeout(400);
      return { ...r, ok: r.shown && r.room >= r.need && !r.out };
    })();
    // めいろの「🏁 つぎの ゴール」の 札（3秒）に 知らせを 重ねない：札の 間は 待たせて、消えたら 出す（自分で 遊んで 分かった：ごほうびを とじると 待たせた 知らせと 札が 同時に 出て、札の 見出しが かくれて いた）
    R.checks.nextGoalToast = await w.page.evaluate(async () => {
      const G = nishioGo, M = nishioPixel.maze, wait = ms => new Promise(res => setTimeout(res, ms)), el = document.getElementById('toast'), msg = '🎁 テストの 知らせ（つぎの ゴール）';
      document.getElementById('pxInfo').hidden = true; el.classList.remove('show');
      const maze = M.on(), g0 = G.guide, g = G.spots.filter(x => x.lat && !x.shop && (!g0 || x.id !== g0.id) && G.dist(G.me, x) > 300 && G.dist(G.me, x) < 2000).sort((a, b) => G.dist(G.me, a) - G.dist(G.me, b))[0];
      if (!g) return { spot: 'none' };
      G.setGuide({ kind: 'spot', id: g.id, name: g.name, why: 'テスト', by: 'テスト' });
      let seen = false;
      for (let i = 0; i < 10; i++) { await wait(60); const n = M.next ? M.next() : null; if (n && n.on) { seen = true; break; } }   // 新しい ゴールに なった（直す 前の コードには M.next が ないので 0.6秒 待つ）
      G.toast(msg);
      let over = false;
      for (let i = 0; i < 12; i++) { if (el.classList.contains('show') && el.textContent === msg) over = true; await wait(200); }   // 札の 出はじめ 2.4秒（道のりを 待つ 間と 札の 3秒の うち）
      let after = false;
      for (let i = 0; i < 50 && !after; i++) { await wait(200); after = el.classList.contains('show') && el.textContent === msg; }   // 札が 消えたら（ほかの 知らせが あれば その あと。10秒まで）
      const off = M.next ? !M.next().on : null;
      el.classList.remove('show');
      // 札の 途中で 地図の 絵が 止まっても（ステージの めいろ など）、知らせを 待たせた ままに しない（絵が 止まると 札の 時間が 進まない）
      const g2 = G.spots.filter(x => x.lat && !x.shop && x.id !== g.id && (!g0 || x.id !== g0.id) && G.dist(G.me, x) > 300 && G.dist(G.me, x) < 2000).sort((a, b) => G.dist(G.me, a) - G.dist(G.me, b))[0];
      let paused = null;
      if (g2) {
        G.setGuide({ kind: 'spot', id: g2.id, name: g2.name, why: 'テスト', by: 'テスト' });
        for (let i = 0; i < 10; i++) { await wait(60); if (M.next && M.next().on) break; }
        nishioPixel.meiroApi.pause(true); await wait(100);
        const m2 = '🎁 テストの 知らせ（止めた あと）'; G.toast(m2); await wait(300);
        paused = el.classList.contains('show') && el.textContent === m2;
        nishioPixel.meiroApi.pause(false); el.classList.remove('show');
      }
      return { maze, seen, over, after, off, paused, ok: maze && !over && after && paused !== false };
    });
    // 「🏁 つぎの ゴール」の 札（3秒）に 縁の 矢印の「🏁 2.0km」が かぶらない（重なる 間は 道のりの 札を 描かない。自分で 遊んで 分かった：360×640 で 札の 名前の 行に かぶった）
    R.checks.nextGoalLabel = await (async () => {
      const vp = w.page.viewportSize();
      await w.page.setViewportSize({ width: 360, height: 640 }); await w.page.waitForTimeout(400);
      const r = await w.page.evaluate(async () => {
        const G = nishioGo, wait = ms => new Promise(res => setTimeout(res, ms)), cv = document.getElementById('pxCanvas'), ctx = cv.getContext('2d');
        const clear = () => { const rw = document.getElementById('reward'); if (rw.classList.contains('show')) rw.click(); document.getElementById('pxInfo').hidden = true; document.getElementById('share').hidden = true; };
        clear(); await wait(300); clear();
        const covered = nishioPixel.maze.arrive().covered, maze = nishioPixel.maze.on();   // 地図が 窓で かくれて いると 札は 出ない（しらべる ため）
        const mPer = (a, b) => [(b.lng - a.lng) * 111320 * Math.cos(a.lat * Math.PI / 180), (b.lat - a.lat) * 110540];
        const cands = G.spots.filter(x => x.lat && !x.shop && G.dist(G.me, x) > 1000 && G.dist(G.me, x) < 3500).map(x => { const [e, n] = mPer(G.me, x); return { x, e, n }; }).filter(o => o.e < 0 && o.n > 0).sort((a, b) => Math.abs(a.n / -a.e - 0.46) - Math.abs(b.n / -b.e - 0.46)).slice(0, 8);   // 西北西：縁の 矢印が 札の 高さに 出る
        const keep = { fr: ctx.fillRect, ft: ctx.fillText }, dpr = Math.min(devicePixelRatio || 1, 3), U = 28 * dpr;
        let box = null, texts = [];
        ctx.fillRect = function (x, y, w0, h0) { if (/^rgba\(10, 20, 30, 0\.62\)$/.test(String(this.fillStyle))) box = [x, y, x + w0, y + h0]; return keep.fr.apply(this, arguments); };
        ctx.fillText = function (t, x, y) { if (/^\d+(\.\d)?(km|m)$/.test(t)) { const px = +(/(\d+)px/.exec(this.font) || [0, 0])[1]; texts.push([x, y, px]); } return keep.ft.apply(this, arguments); };
        let res = { name: 'none', frames: 0, hits: 0, hid: 0, covered, maze };
        for (const g of cands) {   // 縁の 道のりの 札が 札に かかる ゴールを さがす（お米の 位置で かわる）
          G.setGuide({ kind: 'spot', id: g.x.id, name: g.x.name, why: 'テスト', by: 'テスト' });
          let frames = 0, hits = 0, hid = 0;
          for (let i = 0; i < 60; i++) {   // 札の 3秒の 間（と 道のりを 待つ 間）、1こまずつ 見る
            box = null; texts = [];
            await new Promise(res => requestAnimationFrame(res));
            if (box) {
              frames++;
              // 縁の 🏁・道のり・タップの 札（道のりの 字の 位置と 大きさから：字は 矢印の 内がわ bx＋0.5U、大きさ 0.62U）が 札に かかる のに 描いた（直す 前）
              if (texts.some(([x, y, px]) => { const U = px / 0.62, bx = x - U * 0.5; return px > 0 && bx - U * 1.2 < box[2] && bx + U * 2.2 > box[0] && y - U * 1.0 < box[3] && y + U * 1.0 > box[1]; })) hits++;
              const n = nishioPixel.maze.next && nishioPixel.maze.next(); if (n && n.labHide) hid++;   // 札に かかるので 描かなかった（直した あと）
            }
            await wait(50);
          }
          if (hits || hid) { res = { name: g.x.name, frames, hits, hid }; break; }
          clear();
          await wait(1500);
        }
        ctx.fillRect = keep.fr; ctx.fillText = keep.ft;
        return res;
      });
      await w.page.setViewportSize(vp); await w.page.waitForTimeout(400);
      return { ...r, ok: r.hid > 0 && r.hits === 0 };
    })();
    // めいろの 縁の 矢印と 道のりの 札に 知らせが 重ならない（重なる ときは 知らせが 下へ。自分で 遊んで 分かった：北西の ゴールで「2.0km」が 4行の 知らせに かくれた）
    R.checks.mzEdgeToast = await (async () => {
      const vp = w.page.viewportSize();
      await w.page.setViewportSize({ width: 320, height: 568 }); await w.page.waitForTimeout(400);
      const r = await w.page.evaluate(async () => {
        const G = nishioGo, M = nishioPixel.maze, wait = ms => new Promise(res => setTimeout(res, ms)), el = document.getElementById('toast'), cv = document.getElementById('pxCanvas');
        const g = G.spots.filter(x => x.lat && !x.shop && x.lat > G.me.lat + 0.008 && G.dist(G.me, x) > 1200 && G.dist(G.me, x) < 3500).sort((a, b) => Math.abs(a.lng - G.me.lng) - Math.abs(b.lng - G.me.lng))[0];   // 北の ゴール：矢印が 上の 縁に 出る
        if (!g) return { spot: 'none' };
        G.setGuide({ kind: 'spot', id: g.id, name: g.name, why: 'テスト', by: 'テスト' });
        await wait(6500);   // 「🏁 つぎの ゴール」の 札が 消えるまで
        document.getElementById('pxInfo').hidden = true; el.classList.remove('show');
        const msg = '🧭 水色の 線が ゴールへの 道。✕ は 行き止まり（めいろに なれたら、せっていで 消せます）';
        G.toast(msg); await wait(900);
        const a = M.mapArrow, c = cv.getBoundingClientRect(), k = c.width / cv.width, q = el.getBoundingClientRect();
        const A = a && [c.left + a[0] * k, c.top + a[1] * k, c.left + a[2] * k, c.top + a[3] * k];
        const shown = el.classList.contains('show') && el.textContent === msg, hit = !!A && q.left < A[2] && q.right > A[0] && q.top < A[3] && q.bottom > A[1];
        const low = el.classList.contains('wlow');
        el.classList.remove('show', 'wlow');
        return { arrow: !!A, shown, hit, low, A: A && A.map(Math.round), t: [q.top, q.bottom].map(Math.round) };
      });
      await w.page.setViewportSize(vp); await w.page.waitForTimeout(400);
      return { ...r, ok: r.arrow && r.shown && !r.hit };   // （めいろ図を 開いた ときの 確かめは 図を なくしたので やめた）
    })();
    // 横向きの 低い 画面でも、縁の 矢印と 道のりの 札に 知らせが 重ならない（自分で 遊んで 分かった：740×360 で 上の ゴールの 矢印と「840m」が「📅 あしたも来ると +20pt」に かくれた。
    // 上も 下も 札に 重なるので、札の 横（wside）か いちばん 下（wfloor）へ）。直す 前は 上の まま 重なる
    R.checks.mzEdgeToastWide = await (async () => {
      const vp = w.page.viewportSize(), out = {};
      for (const [W, H] of [[740, 360], [568, 320]]) {
        await w.page.setViewportSize({ width: W, height: H }); await w.page.waitForTimeout(400);
        out[W + 'x' + H] = await w.page.evaluate(async () => {
          const G = nishioGo, M = nishioPixel.maze, wait = ms => new Promise(res => setTimeout(res, ms)), el = document.getElementById('toast'), cv = document.getElementById('pxCanvas');
          const g = G.spots.filter(x => x.lat && !x.shop && x.lat > G.me.lat + 0.008 && G.dist(G.me, x) > 1200 && G.dist(G.me, x) < 3500).sort((a, b) => Math.abs(a.lng - G.me.lng) - Math.abs(b.lng - G.me.lng))[0];   // 北の ゴール：矢印が 上の 縁の まん中あたりに 出る
          if (!g) return { spot: 'none' };
          G.setGuide({ kind: 'spot', id: g.id, name: g.name, why: 'テスト', by: 'テスト' });
          await wait(6500);   // 「🏁 つぎの ゴール」の 札が 消えるまで
          document.getElementById('pxInfo').hidden = true; el.classList.remove('show', 'wlow', 'wside', 'wfloor');
          const msg = '📅 あしたも来ると +20pt';
          G.toast(msg); await wait(900);
          const a = M.mapArrow, c = cv.getBoundingClientRect(), k = c.width / cv.width, q = el.getBoundingClientRect();
          const A = a && [c.left + a[0] * k, c.top + a[1] * k, c.left + a[2] * k, c.top + a[3] * k];
          const shown = el.classList.contains('show') && el.textContent === msg, hit = !!A && q.left < A[2] && q.right > A[0] && q.top < A[3] && q.bottom > A[1];
          const mode = ['wlow', 'wside', 'wfloor'].find(m => el.classList.contains(m)) || 'top', inside = q.left >= 0 && q.right <= innerWidth && q.top >= 0 && q.bottom <= innerHeight;
          el.classList.remove('show', 'wlow', 'wside', 'wfloor');
          return { arrow: !!A, shown, hit, mode, inside, A: A && A.map(Math.round), q: [q.left, q.top, q.right, q.bottom].map(Math.round) };
        });
      }
      // 横（wside）に 置いた まま スマホを たてに しても、知らせが 画面の 外に 出ない（--toast-x は 画素。Codex の 指摘）
      await w.page.setViewportSize({ width: 740, height: 360 }); await w.page.waitForTimeout(400);
      const before = await w.page.evaluate(async () => {   // 矢印が 少し 左に ある ゴール（北北西）を さがす：知らせが 矢印の 右、たて向きの 画面より 右に 置かれる 形
        const G = nishioGo, M = nishioPixel.maze, wait = ms => new Promise(res => setTimeout(res, ms)), el = document.getElementById('toast'), at = { lat: G.me.lat, lng: G.me.lng };
        let mode = 'none';
        for (const dl of [-0.002, -0.003, -0.0045, -0.006]) {
          G.setGuide({ kind: 'spot', id: 'test-rot' + dl, name: 'テストの 北の ゴール', lat: at.lat + 0.012, lng: at.lng + dl }); await wait(6500);
          document.getElementById('pxInfo').hidden = true; el.classList.remove('show', 'wlow', 'wside', 'wfloor');
          G.toast('📅 あしたも来ると +20pt'); await wait(900);
          mode = ['wlow', 'wside', 'wfloor'].find(m => el.classList.contains(m)) || 'top';
          if (mode === 'wside' && el.getBoundingClientRect().left > 360) return { mode, dl, left: Math.round(el.getBoundingClientRect().left) };
        }
        return { mode, dl: null };
      });
      await w.page.setViewportSize({ width: 360, height: 640 }); await w.page.waitForTimeout(700);
      const rot = await w.page.evaluate(() => {
        const el = document.getElementById('toast'), q = el.getBoundingClientRect(), mode = ['wlow', 'wside', 'wfloor'].find(m => el.classList.contains(m)) || 'top';
        const res = { before: null, mode, shown: el.classList.contains('show'), inside: q.left >= 0 && q.right <= innerWidth, q: [q.left, q.right].map(Math.round) };
        el.classList.remove('show', 'wlow', 'wside', 'wfloor'); nishioGo.setGuide(null);
        return res;
      });
      out.rotate = { ...rot, before };
      await w.page.setViewportSize(vp); await w.page.waitForTimeout(400);
      const rs = Object.values(out).filter(r => r !== out.rotate);
      return { ...out, ok: rs.every(r => r.spot === 'none' || (r.arrow && r.shown && !r.hit && r.inside)) && rs.some(r => r.arrow) && (out.rotate.before.mode !== 'wside' || !out.rotate.before.dl || (out.rotate.shown && out.rotate.inside)) };
    })();
    // せかいちずの「ゴール：…」の 札に 知らせが 重ならない（重なる ときは 知らせが 下へ。自分で 遊んで 分かった：320×568 で 札が 知らせに かくれて ゴールの 名前が 読めなかった）
    R.checks.worldToast = await (async () => {
      const vp = w.page.viewportSize();
      await w.page.setViewportSize({ width: 320, height: 568 }); await w.page.waitForTimeout(400);
      const r = await w.page.evaluate(async () => {
        const G = nishioGo, M = nishioPixel.maze, wait = ms => new Promise(res => setTimeout(res, ms)), cv = document.getElementById('pxCanvas'), el = document.getElementById('toast');
        document.getElementById('pxInfo').hidden = true;
        const far = G.spots.filter(x => x.lat && x.lat > G.me.lat && G.dist(G.me, x) > 1500 && G.dist(G.me, x) < 3500).sort((a, b) => b.lat - a.lat)[0];   // 北の ゴール：札が 上の ほうに 出る
        if (!far) return { skip: 'no far spot' };
        G.setGuide({ kind: 'spot', id: far.id, name: far.name, why: 'テスト', by: 'テスト' });
        let a = null;
        for (let i = 0; i < 30 && !a; i++) { await wait(200); a = M.mapArrow; const rw = document.getElementById('reward'); if (rw.classList.contains('show')) rw.click(); }
        if (!a) { G.setGuide(null); return { far: far.name, arrow: null }; }
        const rc0 = cv.getBoundingClientRect(), dpr = cv.width / rc0.width;
        cv.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: rc0.left + (a[0] + a[2]) / 2 / dpr, clientY: rc0.top + (a[1] + a[3]) / 2 / dpr }));
        await wait(800);
        G.toast('🧭 水色の 線が ゴールへの 道。✕ は 行き止まり（めいろに なれたら、せっていで 消せます）'); await wait(600);   // 本当に 出る 長さの 知らせ（320px で 4行）
        const g = M.worldGoal, tag = g && g[2], rc = cv.getBoundingClientRect(), k = rc.width / cv.width;
        const T = tag && [rc.left + tag[0] * k, rc.top + tag[1] * k, rc.left + tag[2] * k, rc.top + tag[3] * k];
        const over = q => !!T && q.left < T[2] && q.right > T[0] && q.top < T[3] && q.bottom > T[1];
        const c = el.cloneNode(true); ['id', 'role', 'aria-live'].forEach(x => c.removeAttribute(x)); c.classList.remove('wlow', 'low'); c.style.cssText = 'transition:none;visibility:hidden'; el.parentNode.appendChild(c);
        const would = over(c.getBoundingClientRect()); c.remove();   // ふつうの 位置（上）なら 重なる 形か
        const tr = el.getBoundingClientRect();
        return { far: far.name, world: document.body.classList.contains('pxw'), tagIn: !!T && T[1] >= 0 && T[3] <= innerHeight, would, wlow: el.classList.contains('wlow'), hit: over(tr),
          drag: T && { x: (T[0] + T[2]) / 2, y: (T[1] + T[3]) / 2, dy: Math.round((tr.top + tr.bottom) / 2 - (T[1] + T[3]) / 2) } };
      });
      // 下げた あとに 地図を 引っぱって、札を 下げた 知らせの 所へ 動かす：知らせは 上へ もどって、札は かくれない（Codex の 指摘）
      if (r.world && r.drag && r.wlow) {
        const { x, y, dy } = r.drag, y0 = Math.max(150, Math.min(400, y));
        await w.page.mouse.move(x, y0); await w.page.mouse.down();
        for (let i = 1; i <= 8; i++) { await w.page.mouse.move(x, y0 + dy * i / 8); await w.page.waitForTimeout(30); }
        await w.page.mouse.up(); await w.page.waitForTimeout(700);
      }
      const r2 = await w.page.evaluate(async () => {
        const G = nishioGo, M = nishioPixel.maze, wait = ms => new Promise(res => setTimeout(res, ms)), cv = document.getElementById('pxCanvas'), el = document.getElementById('toast');
        const g = M.worldGoal, tag = g && g[2], rc = cv.getBoundingClientRect(), k = rc.width / cv.width;
        const T = tag && [rc.left + tag[0] * k, rc.top + tag[1] * k, rc.left + tag[2] * k, rc.top + tag[3] * k], q = el.getBoundingClientRect();
        const res = { tagIn2: !!T && T[1] >= 0 && T[3] <= innerHeight, wlow2: el.classList.contains('wlow'), hit2: !!T && el.classList.contains('show') && q.left < T[2] && q.right > T[0] && q.top < T[3] && q.bottom > T[1], shown2: el.classList.contains('show') };
        if (document.body.classList.contains('pxw')) document.getElementById('pxWorld').click();
        el.classList.remove('show'); await wait(300); G.setGuide(null);
        return res;
      });
      await w.page.setViewportSize(vp); await w.page.waitForTimeout(400);
      return { ...r, ...r2, ok: !!r.skip || (r.world && r.tagIn && r.would && r.wlow && !r.hit && r2.shown2 && !r2.hit2) };
    })();
    // おたすけの「🧭 水色の 線が…」の 知らせは、「🏁 つぎの ゴール」の 大きな 文字が 出ている 間は 出さない（その あとに 出す）。
    // 自分で 遊んで 分かった（320×568）：はじめの ゴールの 名前と 道のりが、この 知らせの 下に かくれて 読めなかった
    R.checks.mzHelpAfterBanner = await w.page.evaluate(async () => {
      const G = nishioGo, P = nishioPixel, M = P.maze, wait = ms => new Promise(res => setTimeout(res, ms)), el = document.getElementById('toast');
      const g0 = G.guide, goals0 = localStorage.getItem('nsg_mzgoals'), help0 = localStorage.getItem('nsg_mzhelp');   // おわったら もどす（あとの 確かめに ひびかない ように）
      localStorage.setItem('nsg_mzgoals', '0'); localStorage.removeItem('nsg_mzhelp');
      document.getElementById('pxInfo').hidden = true;
      const s = G.spots.filter(x => x.lat && G.dist(G.me, x) > 300 && G.dist(G.me, x) < 900).sort((a, b) => G.dist(G.me, a) - G.dist(G.me, b))[0];
      if (!s) return { skip: 'no spot', ok: true };
      el.classList.remove('show');
      M.helpReset();
      G.setGuide({ kind: 'spot', id: s.id, name: s.name, why: 'テスト', by: 'テスト' });
      let during = false, shown = false, sawBanner = false;
      for (let i = 0; i < 80 && !shown; i++) {
        await wait(100);
        const rw = document.getElementById('reward'); if (rw.classList.contains('show')) rw.click();
        const h = M.help(), on = el.classList.contains('show') && /水色の 線が/.test(el.textContent);
        if (h.banner) sawBanner = true;
        if (on && h.banner) during = true;
        if (on) shown = true;
      }
      G.setGuide(g0 || null);
      if (goals0 === null) localStorage.removeItem('nsg_mzgoals'); else localStorage.setItem('nsg_mzgoals', goals0);
      if (help0 !== null) localStorage.setItem('nsg_mzhelp', help0);
      return { spot: s.name, sawBanner, during, shown, ok: sawBanner && shown && !during };
    });
    // 同じ めいろの マスに ある 2つの ゴールが つづいても、ゴールが かわった ことに 気づく（「🏁 つぎの ゴール」が 出て、時計が やりなおす）。
    // 通しの プレイ確認で 分かった：西尾城跡の ガイドさんと 旧近衛邸の お姉さんは 同じ マスで、話して 次の ゴールに なっても 何も おきなかった
    R.checks.mzSameCellGoal = await w.page.evaluate(async () => {
      const G = nishioGo, P = nishioPixel, M = P.maze, K = M.K, wait = ms => new Promise(res => setTimeout(res, ms));
      const cell = o => { const t = P.toTile(o.lat, o.lng); return Math.floor(t.x / K) + ',' + Math.floor(t.y / K); };
      const cands = G.spots.map(s => ({ kind: 'spot', id: s.id, name: s.name, lat: s.lat, lng: s.lng })).filter(o => o.lat && G.dist(G.me, o) > 150 && G.dist(G.me, o) < 4000);   // 名所だけ（人の ゴールは 立つ 所が ずれて、マスが 同じか 分からない）
      let pair = null;
      for (let i = 0; i < cands.length && !pair; i++) for (let j = i + 1; j < cands.length && !pair; j++) if (cell(cands[i]) === cell(cands[j])) pair = [cands[i], cands[j]];
      if (!pair) return { skip: 'no pair', ok: true };
      const g0 = G.guide, set = o => G.setGuide({ kind: o.kind, id: o.id, name: o.name, why: 'テスト', by: 'テスト' });
      set(pair[0]);
      for (let i = 0; i < 30 && !(M.help().banner === false && M.routePath()); i++) await wait(200);   // 1つめの「つぎの ゴール」が おわるまで
      const before = M.help().banner, ca = cell(G.guide);
      set(pair[1]);
      let banner = false;
      for (let i = 0; i < 15 && !banner; i++) { await wait(100); banner = M.help().banner; }
      const cb = cell(G.guide);
      G.setGuide(g0 || null);
      if (ca !== cb) return { skip: 'not same cell', ca, cb, ok: true };
      return { a: pair[0].name, b: pair[1].name, cell: ca, before, banner, ok: before === false && banner };
    });
    // めいろで ゴールへ 向かう とちゅうに、ゴールでない 人と 話しても、ゴールは かわらない（人の 話の 行き先は、ゴールが ない ときだけ）
    R.checks.mzKeepGoal = await w.page.evaluate(async () => {
      const G = nishioGo, pi = document.getElementById('pxInfo');
      const ns = G.npcs.filter(x => G.dist(G.me, x) < 3000).sort((a, b) => G.dist(G.me, a) - G.dist(G.me, b)), n = ns[0];
      const would = n && G.decideGuide(n), o = would && ns.find(x => x.id !== n.id && x.id !== would.id);   // ゴールは、この人の 話で 決まる 行き先とは 別の 人に
      if (!o) return { skip: true, ok: true };
      G.setGuide({ kind: 'npc', id: o.id, name: o.name, lat: o.lat, lng: o.lng });
      const id0 = G.guide && G.guide.id;
      G.callNpc(n.id); const r = G.talkNpc(n.id); G.callNpc(null); pi.hidden = true;
      const keep = !!(G.guide && G.guide.id === id0);
      G.setGuide(null);
      G.callNpc(n.id); G.talkNpc(n.id); G.callNpc(null); pi.hidden = true;   // ゴールが ない ときは、これまでどおり 人の 話で 決まる
      const set = !!G.guide;
      G.setGuide(null);
      return { npc: n.name, goal: o.name, near: !!(r && r.near), keep, set, ok: !!(r && r.near) && keep && set };
    });
    // めいろでは、人の すすめも すすめる範囲（3km）まで。めいろの 前に 決まった 遠すぎる 行き先（4.5km より 先）は 決め直す
    R.checks.mzFarGuide = await w.page.evaluate(async () => {
      const G = nishioGo, P = nishioPixel, far = G.npcs.filter(n => G.dist(G.me, n) > 5000).sort((a, b) => G.dist(G.me, a) - G.dist(G.me, b))[0];
      if (!far) return { skip: true, ok: true };
      const g1 = G.decideGuide({ id: 'test-from', name: 'テストの人', refer: [[far.id, 'テスト']] });
      const refer = !!(g1 && g1.id === far.id), d1 = g1 ? Math.round(G.dist(G.me, g1)) : 0;
      G.setGuide({ kind: 'npc', id: far.id, name: far.name, lat: far.lat, lng: far.lng, refer: true });
      G.refreshNearby();   // 行き先を 調べなおす（checkGuide）
      const g2 = G.guide, kept = !!(g2 && g2.id === far.id), d2 = g2 ? Math.round(G.dist(G.me, g2)) : 0;
      // ふつうの 地図に 切りかえた 間は、これまでどおり（人の すすめは 10km まで・遠い 行き先も そのまま）
      P.setActive(false);
      const g3 = G.decideGuide({ id: 'test-from', name: 'テストの人', refer: [[far.id, 'テスト']] }), mapRefer = !!(g3 && g3.id === far.id);
      G.setGuide({ kind: 'npc', id: far.id, name: far.name, lat: far.lat, lng: far.lng, refer: true });
      G.refreshNearby();
      const mapKept = !!(G.guide && G.guide.id === far.id);
      P.setActive(true);
      G.setGuide(null);
      return { far: far.name, d: Math.round(G.dist(G.me, far)), refer, d1, kept, d2, mapRefer, mapKept, ok: !refer && d1 <= 3000 && !kept && d2 <= 3000 && mapRefer && mapKept };
    });
    // ゴールが 画面の 上の 外：矢印と 旗は 時計の 札より 下に（札や 左上の 札に 重ならない）
    R.checks.mzArrowTop = await w.page.evaluate(async () => {
      const G = nishioGo, M = nishioPixel.maze, wait = ms => new Promise(res => setTimeout(res, ms));
      G.setGuide({ kind: 'spot', id: 'test-north', name: 'テストの 北', lat: G.me.lat + 0.03, lng: G.me.lng });
      await wait(500);
      const ar = M.mapArrow, S = Math.round(M.clockS * Math.min(window.devicePixelRatio || 1, 3));   // 時計の 字の 大きさ（MZ_CLOCK_PX）
      const hits = [];   // 右上の ボタンの ほう（北東）・左上の 札の ほう（北西）でも、矢印が ボタン・札に 重ならない
      for (const dl of [0.02, -0.02]) {
        G.setGuide({ kind: 'spot', id: 'test-ne', name: 'テストの 北東', lat: G.me.lat + 0.03, lng: G.me.lng + dl });
        await wait(700);
        const at = M.arrowAt, hud = M.hudRects();
        hits.push(at ? hud.filter(r => at[0] + at[2] > r[0] && at[0] - at[2] < r[2] && at[1] + at[2] > r[1] && at[1] - at[2] < r[3]).length : -1);
      }
      G.setGuide(null);
      return { top: ar ? Math.round(ar[1]) : null, clock: Math.round(S * 2.35), hits, ok: !!ar && ar[1] >= S * 2.35 - 1 && hits.every(n => n === 0) };
    });
    // 地図の 上に 出る 知らせ（長い 文）が、右上の 丸い ボタン（せかいちず・しらべる など）に 重ならない（自分で 遊んで 分かった：「歩いた道が 8.0km に！」が 2つめの ボタンに かかっていた）
    R.checks.toastHud = await w.page.evaluate(async () => {
      const wait = ms => new Promise(res => setTimeout(res, ms)), el = document.getElementById('toast'), msg = '👣 これまでに歩いた道が 8.0km に！ +150pt（つぎの節目は 16km）テストの 長い 知らせ';
      for (let i = 0; i < 6; i++) {   // 窓（ごほうび・人の話・あそびかた）が 開いて いると、知らせは 待ちの 列に 入るか 下に 出るので、先に とじる
        const r = document.getElementById('reward'); if (r.classList.contains('show')) r.click();
        document.getElementById('pxInfo').hidden = true; const h = document.getElementById('howto'); if (h && !h.hidden) h.hidden = true;
        await wait(150);
      }
      nishioGo.toast(msg);
      await wait(450);
      const t = el.getBoundingClientRect(), hit = [], shown = el.classList.contains('show') && el.textContent === msg, top = t.bottom < innerHeight / 2;   // この 知らせが 画面の 上に 出て いる ときだけ 比べる
      for (const b of document.querySelectorAll('.px-zoom button')) {
        if (!b.getClientRects().length || getComputedStyle(b).visibility === 'hidden') continue;
        const r = b.getBoundingClientRect();
        if (r.width && t.left < r.right && t.right > r.left && t.top < r.bottom && t.bottom > r.top) hit.push(b.id || b.title || b.textContent.trim().slice(0, 6));
      }
      document.getElementById('toast').classList.remove('show');
      return { toast: [Math.round(t.left), Math.round(t.top), Math.round(t.right), Math.round(t.bottom)], shown, top, hit, ok: shown && top && t.width > 0 && !hit.length };
    });
    // 小さい 画面（320×568）で 人の 話の 窓が 開いて いる 間の 知らせが、窓（「▶ とじる」）に 重ならない。
    // 知らせが 先に 出て あとから 窓が 開く ときも（ゴールの 人に 着いた とき。自分で 遊んで 分かった：窓の 下の はしに 知らせが 重なって「▶ とじる」が 見えなかった）
    R.checks.toastTalk = await (async () => {
      const vp = w.page.viewportSize();
      await w.page.setViewportSize({ width: 320, height: 568 }); await w.page.waitForTimeout(400);
      const r = await w.page.evaluate(async () => {
        const wait = ms => new Promise(res => setTimeout(res, ms)), el = document.getElementById('toast'), pi = document.getElementById('pxInfo'), body = document.getElementById('pxInfoBody');
        const msg = '💬🎉🏁 +30pt Lv7　📜 → 近所のおばあさん（紅樹院（茶祖の寺）） 🔍';
        const rw = document.getElementById('reward'); if (rw.classList.contains('show')) rw.click();
        const keep = body.innerHTML;
        body.innerHTML = '<div style="height:200px">テスト：顔の 絵と 3行の 話（窓の 高さを 本物に 近く）</div>';
        const settle = async () => {   // 知らせが すべり おわって 止まるまで 待つ（0.3秒の 動きの とちゅうを はかると、重い ときに 窓の 上へ はみ出して 見えた：上の はし 319 → 止まると 332）
          let prev = null, same = 0;
          for (let k = 0; k < 40 && same < 3; k++) { await wait(50); const y = Math.round(el.getBoundingClientRect().top); same = y === prev ? same + 1 : 0; prev = y; }
        };
        const look = () => { const t = el.getBoundingClientRect(), d = pi.querySelector('.dq').getBoundingClientRect(); return { shown: el.classList.contains('show'), hit: t.top < d.bottom && t.bottom > d.top, t: [Math.round(t.top), Math.round(t.bottom)], d: [Math.round(d.top), Math.round(d.bottom)] }; };
        pi.hidden = true; el.classList.remove('show'); await wait(350);
        nishioGo.toast(msg); await wait(100); pi.hidden = false; await wait(150); await settle();   // 知らせが 先、窓が あと
        const first = look();
        pi.hidden = true; el.classList.remove('show'); await wait(350);
        pi.hidden = false; await wait(100); nishioGo.toast(msg + '　'); await wait(150); await settle();   // 窓が 先、知らせが あと
        const second = look();
        pi.hidden = true; el.classList.remove('show'); await wait(350);
        // 話の ページを めくって 窓が のびる（pxInfoBody だけ 書きかわる。hidden は そのまま）
        body.innerHTML = '<div style="height:40px">みじかい ページ</div>'; pi.hidden = false; await wait(100);
        nishioGo.toast(msg); await wait(150); await settle();
        const shortPage = look();
        body.innerHTML = '<div style="height:200px">ながい ページ</div>'; await wait(150); await settle();
        const page = look();
        // 下に よけて いる 知らせを、窓を 開いた まま 別の 知らせで 書きかえる（low を 外した 直後の、まだ 下に いる 位置で はからない）
        pi.hidden = true; el.classList.remove('show'); await wait(350);
        pi.hidden = false; await wait(100); nishioGo.toast(msg + '（まえ）'); await wait(150); await settle();
        const before = look(), wasLow = el.classList.contains('low');
        nishioGo.toast(msg + '（つぎ）'); await wait(150); await settle();
        const update = { ...look(), before, wasLow };
        pi.hidden = true; el.classList.remove('show'); body.innerHTML = keep;
        const fine = x => x.shown && !x.hit;
        return { first, second, shortPage, page, update, ok: fine(first) && fine(second) && fine(page) && fine(before) && fine(update) };
      });
      await w.page.setViewportSize(vp); await w.page.waitForTimeout(400);
      return r;
    })();
    // めいろの「🏁 ゴール！」が 出ている 間は、頭の 上に 浮かぶ 文字（「→ 〇〇へ ころころ」など）を 待たせ、消えてから 浮かべる（重なって どちらも 読めなかった）
    R.checks.mzBannerFloat = await w.page.evaluate(async () => {
      const P = nishioPixel, M = P.maze, wait = ms => new Promise(res => setTimeout(res, ms)), t = 'テストの 浮かぶ 文字', t2 = 'テストの 浮かぶ 文字 2';
      M.goalFx('★★★ 0分10秒（めいろの 道のり 100m）');
      await wait(300); P.floatText(t); await wait(300); P.floatText(t2);   // 2つ たまる（行き先の 案内と 金の 米つぶ など）
      let during = false;
      for (let i = 0; i < 10; i++) { await wait(150); if (P.floatsDrawn.some(x => x === t || x === t2)) during = true; }   // ゴールの 文字が 出ている 間
      for (let i = 0; i < 40 && M.banner; i++) await wait(150);   // ゴールの 文字が 消えるまで（4秒）
      const t3 = 'テストの 浮かぶ 文字 3';   // 順に 出している 間に 新しく 来た 文字（金の 米つぶ など）も、列の 最後に
      let after = false, after2 = false, after3 = false, both = false, sent3 = false;   // 消えた あとは 1つずつ（同じ こまに 2つ 描かない）
      for (let i = 0; i < 110; i++) {
        await wait(50); const d = P.floatsDrawn;
        if (d.includes(t)) after = true; if (d.includes(t2)) after2 = true; if (d.includes(t3)) after3 = true;
        if ([t, t2, t3].filter(x => d.includes(x)).length > 1) both = true;
        if (after2 && !sent3) { P.floatText(t3); sent3 = true; }   // 2つめが 出はじめた ところで
      }
      return { during, after, after2, after3, both, gone: !M.banner, ok: !during && after && after2 && after3 && !both };
    });
    // ゴールの 紙ふぶきは 西尾らしく：お米つぶ・抹茶の 葉・金の つぶ
    R.checks.goalConfetti = await w.page.evaluate(() => {
      const M = nishioPixel.maze, n0 = M.fxKinds().length;
      M.goalFx('');
      const k = M.fxKinds().slice(n0), c = x => k.filter(y => y === x).length;
      return { n: k.length, rice: c('rice'), leaf: c('leaf'), gold: c('gold'), ok: k.length === 60 && c('rice') >= 25 && c('leaf') >= 15 && c('gold') >= 5 };
    });
    // ゴールが 画面の 左右の はしに ある とき：ゴールの 名前が 画面から はみ出して 切れない（自分で 遊んで 分かった：らいすぴあの 店員さんの 名前の 頭が 切れていた）
    R.checks.mzGoalEdge = await w.page.evaluate(async () => {
      const G = nishioGo, M = nishioPixel.maze, wait = ms => new Promise(res => setTimeout(res, ms)), nm = 'らいすぴあの店員さん（らいすぴあ・秀幸）', out = {};
      for (const side of [-1, 1]) {
        let best = null;
        for (let k = 2; k <= 24; k++) {   // ゴールを すこしずつ 横へ：画面に 描かれて いる うちで いちばん はしに 近い 所
          // そばに 置くと「着いた」と みなされ、次の ゴール（人など）に かわる ことが ある（左の 1回目で ときどき 落ちた：ゴールが「氏子のおばあさん」に かわって いた）。かわったら 置きなおす
          let L = null, kept = false;
          for (let tr = 0; tr < 3; tr++) {
            G.setGuide({ kind: 'spot', id: 'test-edge', name: nm, lat: G.me.lat, lng: G.me.lng + side * k * 0.00015 });
            await wait(220);
            if (G.guide && G.guide.id === 'test-edge') { L = M.goalLab; kept = true; break; }
          }
          if (!kept && !best) { out['why' + side] = { k, on: M.on(), guide: G.guide && G.guide.name }; continue; }   // 3回とも 着いた ことに なる ほど そば（k=2 で「旧近衛邸」に かわって 落ちた）：もう少し はなして
          if (!L) break;   // 画面の 外（名前を 描かない）
          if (!best || (side < 0 ? L.ex < best.ex : L.ex > best.ex)) best = L;
        }
        out[side < 0 ? 'left' : 'right'] = best && { ex: Math.round(best.ex), x0: Math.round(best.x0), x1: Math.round(best.x1), w: best.w };
      }
      G.setGuide(null);
      const L = out.left, R = out.right;
      return { ...out, ok: !!L && !!R && L.ex < (L.x1 - L.x0) / 2 && R.ex > R.w - (R.x1 - R.x0) / 2 && L.x0 >= 0 && R.x1 <= R.w };   // 名前の 半分より はしに ゴールが ある 所まで 試して、切れない
    });
    // 迷って いる 間（25秒 近づけない）：光る 点は 毎回 出すが、知らせは ゴールごとに 1回目だけ。3回目は おたすけを すすめる（1回の あそびで 1回）
    R.checks.mzHintToast = await w.page.evaluate(async () => {
      const G = nishioGo, M = nishioPixel.maze, wait = ms => new Promise(res => setTimeout(res, ms)), got = [], t0 = G.toast, h0 = localStorage.getItem('nsg_mzhelp');
      localStorage.setItem('nsg_mzhelp', 'off');
      G.setGuide(G.decideGuide(null));
      for (let i = 0; i < 20 && !(M.routePath() && M.routePath().length >= 3); i++) await wait(250);
      if (!(M.routePath() && M.routePath().length >= 3)) { if (h0 === null) localStorage.removeItem('nsg_mzhelp'); else localStorage.setItem('nsg_mzhelp', h0); return { skip: true, ok: true }; }
      G.toast = m => { if (/光る 点|まよったら/.test(m)) got.push(m); };   // ほかの 知らせ（「めいろに なれてきたので…」など）は 数えない
      try {
        for (let i = 0; i < 4; i++) { M.lost(); await wait(150); }
      } finally { G.toast = t0; if (h0 === null) localStorage.removeItem('nsg_mzhelp'); else localStorage.setItem('nsg_mzhelp', h0); }
      G.setGuide(null);
      const first = got.filter(m => /光る 点/.test(m)).length, offer = got.filter(m => /まよったら/.test(m)).length;
      return { got, ok: first === 1 && offer === 1 && got.length === 2 && /光る 点/.test(got[0]) };
    });
    const frozen = p0 === null ? p1 === null : !!(p1 && Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) < 0.01);   // 読んでいる 間は 転がり はじめない（お米の 位置が まだ ない ままでも よい）
    R.checks.howtoFirst = { sub, shown, toastOver, toastAfterOk, frozen, closed, rolls, again, reopen, heldBack, afterOk, ok: !!sub && shown && !toastOver && frozen && closed && rolls && !again && reopen && heldBack && afterOk };
    // 名所の窓の「みんなの声」は どんな 声かだけ。数（いいねの 数）は 出さない（運営者の声「競わない設計」）
    R.checks.reactNoCount = await w.page.evaluate(() => {
      const G = nishioGo;
      if (!G.reactLine) return { ok: false, why: 'no-api' };
      const h = G.reactLine({ id: 'test' }, { love: 12, calm: 3, photo: 7 }), t = h.replace(/<[^>]+>/g, '');
      return { t, ok: /😍/.test(t) && /よかった/.test(t) && /🍵/.test(t) && !/\d/.test(t) && t.indexOf('😍') < t.indexOf('📷') && t.indexOf('📷') < t.indexOf('🍵') };   // 多い じゅんの まま、数字は なし
    });
    // さんぽ仲間（ライバル）は、すぐ そば（300m 未満）の 次の 行き先へは 先回りしない（その 次の 遠い 行き先へ）。
    // 自分で 遊んで 分かった：6マス 先の 人へ「先に 行っとるでね」が 着いた あとに 出て、4秒後に「おそかったじゃん！」
    R.checks.rivalNear = await w.page.evaluate(() => {
      const G = nishioGo, S = G.state, me = G.me, r0 = S.rival, n0 = S.rivalN;
      if (!me || !G.rivalSay) return { ok: false, why: 'no-api' };
      S.rival = null; S.rivalN = 2;   // 次に 着くと 先回りする 番
      G.rivalSay({ id: 'test-a', name: 'テストA' }, { kind: 'spot', id: 'test-near', name: 'テスト近く', lat: me.lat + 0.0005, lng: me.lng });   // 約55m
      const a = { at: S.rival && S.rival.at, n: S.rivalN };
      G.rivalSay({ id: 'test-b', name: 'テストB' }, { kind: 'spot', id: 'test-far', name: 'テスト遠く', lat: me.lat + 0.01, lng: me.lng });   // 約1.1km
      const b = { at: S.rival && S.rival.at, n: S.rivalN };
      S.rival = r0; S.rivalN = n0;
      return { a, b, ok: !a.at && b.at === 'test-far' };
    });
    // 町が かわった ときの 町名の 札（〜 ○○町 〜）は、上の 知らせの 下に 出す（2行の 知らせに 町名が かくれていた。自分で 遊んで 分かった）
    // 本当に 町を かえて 札を 出し、描く 命令から 札の 位置を はかる（直す 前の コードでも はかれる）。この ページの さいごに（お米を 遠くへ 動かす ため）
    R.checks.townToast = await (async () => {
      const vp = w.page.viewportSize();
      await w.page.setViewportSize({ width: 320, height: 568 }); await w.page.waitForTimeout(400);
      const r = await w.page.evaluate(async () => {
        const G = nishioGo, P = nishioPixel, wait = ms => new Promise(res => setTimeout(res, ms)), cv = document.getElementById('pxCanvas'), ctx = cv.getContext('2d'), el = document.getElementById('toast');
        document.getElementById('pxInfo').hidden = true; const rw = document.getElementById('reward'); if (rw.classList.contains('show')) rw.click();
        const keep = { fr: ctx.fillRect, ft: ctx.fillText };
        let box = null, seen = 0, hits = 0, riceHits = 0, lastRect = null;
        ctx.fillRect = function (x, y, w0, h0) { lastRect = [x, y, x + w0, y + h0]; return keep.fr.apply(this, arguments); };
        ctx.fillText = function (t) { if (/^〜 .+ 〜$/.test(t)) box = lastRect; return keep.ft.apply(this, arguments); };
        const msg = '🧭 テストの 知らせ：町の 名前の 札の 上に 2行で 出る 長さの 文に して おく';
        const near = G.spots.filter(x => x.lat && G.dist(G.me, x) > 1500 && G.dist(G.me, x) < 4000);
        const shut = () => { document.querySelectorAll('.medashi').forEach(m => { m.hidden = true; }); document.getElementById('pxInfo').hidden = true; const rw2 = document.getElementById('reward'); if (rw2.classList.contains('show')) rw2.click(); };   // 動いた 先で 出た イベント・話・ごほうびの 窓は とじる（地図が かくれると 札が 描かれない）
        let moved = 0;
        for (const sp of near.slice(0, 6)) {   // 町が かわる 所へ お米を 動かす（札が 出るまで いくつか ためす）
          const t = P.meiroApi.toTile(sp.lat, sp.lng); P.rollPut(t.x + 0.5, t.y + 0.5); moved++;
          await wait(200); shut();
          for (let i = 0; i < 20 && !box; i++) { shut(); G.toast(msg); box = null; await new Promise(res => requestAnimationFrame(() => requestAnimationFrame(res))); await wait(60); }
          if (box) break;
        }
        for (let i = 0; i < 15; i++) {   // 札の 間、こまごとに 知らせと 札の 重なりを 見る
          box = null; G.toast(msg); el.classList.add('show'); el.classList.remove('wlow');   // 知らせを 上に 出した まま 見る（縁の 矢印を よけて 下に いると 比べられず、ときどき seen 0 で 落ちた）
          if (!P.townBox && i % 5 === 0) P.townBanner('テスト町');   // 札が 消えて いたら 出しなおす
          await new Promise(res => requestAnimationFrame(res));
          if (box && el.classList.contains('show') && !el.classList.contains('wlow')) {   // 知らせが 上に 出て いる こま（縁の 矢印を よけて 下に いる こまは 数えない）
            seen++;
            const c = cv.getBoundingClientRect(), k = c.width / cv.width, q = el.getBoundingClientRect();
            const B = [c.left + box[0] * k, c.top + box[1] * k, c.left + box[2] * k, c.top + box[3] * k];
            if (q.left < B[2] && q.right > B[0] && q.top < B[3] && q.bottom > B[1]) hits++;
          }
          const Rb = P.riceBox; if (box && Rb && box[0] < Rb[2] && box[2] > Rb[0] && box[1] < Rb[3] && box[3] > Rb[1]) riceHits++;   // 札が お米に かからない（Codex の 指摘）
          await wait(80);
        }
        // 2だんめ：右上（北東）の ゴールで、下げた 札が 縁の 矢印と 道のりの 札に かからない（Codex の 指摘）。札は テスト用の 入口で 出す
        const msg2 = '🧭 テストの 知らせ：ちょうど 2行に なる 長さ';
        let ne = 'none', arrowSeen = 0, arrowHits = 0, dodged = 0;
        const ngs = G.spots.filter(x => x.lat && x.lat > G.me.lat && x.lng > G.me.lng && G.dist(G.me, x) > 1200 && G.dist(G.me, x) < 5000).slice(0, 14).concat(G.spots.filter(x => x.lat && x.lat > G.me.lat + 0.008 && Math.abs(x.lng - G.me.lng) < (x.lat - G.me.lat) * 0.35 && G.dist(G.me, x) < 6000).slice(0, 6));   // 北東と 北（北の ゴールは 札を 下げると お米に かかりやすい）
        for (const g of ngs) {
          G.setGuide({ kind: 'spot', id: g.id, name: g.name, why: 'テスト', by: 'テスト' }); await wait(6500); shut();   // 「🏁 つぎの ゴール」の 札が 消えるまで
          let as = 0, ah = 0, dg = 0;
          for (let i = 0; i < 12; i++) {
            el.classList.remove('show', 'wlow'); G.toast(msg2); P.townBanner('テスト町'); box = null;
            await new Promise(res => requestAnimationFrame(() => requestAnimationFrame(res)));
            const A = P.maze.mapArrow;
            if (box && A && el.classList.contains('show') && !el.classList.contains('wlow')) {
              as++;
              if (box[0] < A[2] && box[2] > A[0] && box[1] < A[3] && box[3] > A[1]) ah++;   // 札が 縁の 札に かかった（直す 前）
              if (P.townDodged) dg++;   // かかる ので 下へ よけた（直した あと）
            }
            { const Rb = P.riceBox; if (box && Rb && box[0] < Rb[2] && box[2] > Rb[0] && box[1] < Rb[3] && box[3] > Rb[1]) riceHits++; }   // よけた 先が お米に かからない（Codex の 指摘）
            await wait(60);
          }
          if (ah || dg) { ne = g.name; arrowSeen = as; arrowHits = ah; dodged = dg; break; }
        }
        ctx.fillRect = keep.fr; ctx.fillText = keep.ft; el.classList.remove('show');
        return { moved, seen, hits, riceHits, ne, arrowSeen, arrowHits, dodged };
      });
      await w.page.setViewportSize(vp); await w.page.waitForTimeout(400);
      return { ...r, ok: r.seen > 0 && r.hits === 0 && r.riceHits === 0 && (r.arrowHits > 0 || r.dodged > 0) && r.arrowHits === 0 };
    })();
    // 町名の 札：置き場所が ない ときは 待ち、4秒 たっても なければ 出さない（重なる 所には 描かない）。町が かわったら 待ちを 引きつがない（Codex の 指摘 2つ）
    R.checks.townNoRoom = await (async () => {
      const vp = w.page.viewportSize();
      await w.page.setViewportSize({ width: 320, height: 568 }); await w.page.waitForTimeout(400);
      const r = await w.page.evaluate(async () => {
        const G = nishioGo, P = nishioPixel, wait = ms => new Promise(res => setTimeout(res, ms)), cv = document.getElementById('pxCanvas'), ctx = cv.getContext('2d'), el = document.getElementById('toast');
        const shut = () => { document.querySelectorAll('.medashi').forEach(m => { m.hidden = true; }); document.getElementById('pxInfo').hidden = true; const rw = document.getElementById('reward'); if (rw.classList.contains('show')) rw.click(); };
        const keep = { fr: ctx.fillRect, ft: ctx.fillText }; let box = null, lastRect = null;
        ctx.fillRect = function (x, y, w0, h0) { lastRect = [x, y, x + w0, y + h0]; return keep.fr.apply(this, arguments); };
        ctx.fillText = function (t) { if (/^〜 .+ 〜$/.test(t)) box = lastRect; return keep.ft.apply(this, arguments); };
        const ov = (b, r) => !!(b && r && b[0] < r[2] && b[2] > r[0] && b[1] < r[3] && b[3] > r[1]);
        // 1. 北の ゴールで 長い 町名：左右にも 矢印の 下にも 置けない（矢印が 上の まん中、矢印の 下は お米）
        const g = G.spots.filter(x => x.lat && x.lat > G.me.lat + 0.006 && Math.abs(x.lng - G.me.lng) < (x.lat - G.me.lat) * 0.35 && G.dist(G.me, x) < 6000).sort((a, b) => Math.abs(a.lng - G.me.lng) - Math.abs(b.lng - G.me.lng))[0];   // 北の ゴール（まっすぐ 北に ちかい もの）
        let frames = 0, bad = 0, drawn = 0, gone = null;
        if (g) {
          G.setGuide({ kind: 'spot', id: g.id, name: g.name, why: 'テスト', by: 'テスト' }); await wait(6500); shut();
          // 知らせは 上に 止めて おく（知らせは 縁の 矢印に 重なると 横や いちばん 下へ よけて、上が 空く ことが ある。ここでは 置き場所が ない 形を 作る）
          for (const [k, v] of [['top', 'calc(var(--bar-h) + 52px)'], ['bottom', 'auto'], ['left', '50%']]) el.style.setProperty(k, v, 'important');
          P.townBanner('住吉町四丁目の とても ながい 町名');
          for (let i = 0; i < 50; i++) {   // 5秒あまり（待つ 4秒を こえて）
            box = null; G.toast('🧭 テストの 知らせ：ちょうど 2行に なる 長さ');
            await new Promise(res => requestAnimationFrame(res));
            const A = P.maze.mapArrow, Rb = P.riceBox;
            if (A) { frames++; if (box) { drawn++; if (ov(box, A) || ov(box, Rb)) bad++; } }
            await wait(100);
          }
          for (let i = 0; i < 50 && P.townBox; i++) { G.toast('🧭 テストの 知らせ：ちょうど 2行に なる 長さ'); await wait(100); }   // 置ける 所が あって とちゅうから 出た ときは、出た ぶん あとで 消える（5秒で まだ 出ていて ときどき 落ちた）
          gone = !P.townBox;
          ['top', 'bottom', 'left'].forEach(k => el.style.removeProperty(k));
        }
        // 2. 待ちの とちゅうで 本当に 町が かわる：新しい 町名は 前の 待ちを 引きつがない
        G.setGuide(null); await wait(300);   // 縁の 矢印を 出さない（札が 待たずに 出る ように）
        for (let i = 0; i < 40 && P.townBox; i++) await wait(100);   // 前の 町名の 札が 消えるまで
        let reset = null;
        for (const sp of G.spots.filter(x => x.lat && G.dist(G.me, x) > 1500 && G.dist(G.me, x) < 5000).slice(0, 8)) {   // 町が かわる 所へ（札が 出るまで いくつか ためす）
          P.townWait = 3500;
          const t = P.meiroApi.toTile(sp.lat, sp.lng); P.rollPut(t.x + 0.5, t.y + 0.5);
          for (let i = 0; i < 30 && reset === null; i++) { await wait(100); shut(); if (P.townBox) reset = P.townWait < 1000; }   // 新しい 町名の 札が 出た ときの 待ち
          if (reset !== null) break;
          G.setGuide(null);
        }
        ctx.fillRect = keep.fr; ctx.fillText = keep.ft; el.classList.remove('show');
        return { g: g && g.name, frames, drawn, bad, gone, reset };
      });
      await w.page.setViewportSize(vp); await w.page.waitForTimeout(400);
      return { ...r, ok: r.frames > 0 && r.bad === 0 && r.gone === true && r.reset === true };
    })();
    // 浮かぶ 文字（「おしい！ ベストまで あと1…」など）は、めいろの 縁の 矢印と 道のりの 札に 重ねない（自分で 遊んで 分かった：西の ゴールの「2.4km」に 重なった）
    // 描く 命令から 文字の 位置と はばを はかる（2行に 分けても 合わせて はかる。直す 前の コードでも はかれる）。東西の ゴールを いくつか ためし、重なるか よけた こまが 出るまで
    R.checks.floatArrow = await (async () => {
      const vp = w.page.viewportSize();
      await w.page.setViewportSize({ width: 320, height: 568 }); await w.page.waitForTimeout(400);
      const r = await w.page.evaluate(async () => {
        const G = nishioGo, P = nishioPixel, wait = ms => new Promise(res => setTimeout(res, ms)), cv = document.getElementById('pxCanvas'), ctx = cv.getContext('2d');
        const shut = () => { document.querySelectorAll('.medashi').forEach(m => { m.hidden = true; }); document.getElementById('pxInfo').hidden = true; const rw = document.getElementById('reward'); if (rw.classList.contains('show')) rw.click(); };
        const T0 = 'おしい！ ベストまで あと1だったじゃん', keep = ctx.fillText;
        let box = null;
        const T1 = '🏅 あたらしい ベスト ×12！ やったじゃん ほんと すごい';   // 絵文字つきの 文字を 2行に 分けても 1文字も けずらない（Codex の 指摘）
        let pieces = null;
        ctx.fillText = function (t, x, y) { if (pieces && t.length >= 2 && T1.includes(t) && !pieces.includes(t)) pieces.push(t); if (t.length >= 4 && T0.includes(t)) { const fz = parseFloat((/(\d+(?:\.\d+)?)px/.exec(this.font) || [])[1]) || 16, fw = this.measureText(t).width; const b = [x - fw / 2, y - fz, x + fw / 2, y]; box = box ? [Math.min(box[0], b[0]), Math.min(box[1], b[1]), Math.max(box[2], b[2]), Math.max(box[3], b[3])] : b; } return keep.apply(this, arguments); };
        const ov = (b, a) => !!(b && a && b[0] < a[2] && b[2] > a[0] && b[1] < a[3] && b[3] > a[1]);
        const me = G.me, ew = G.spots.filter(x => x.lat && G.dist(me, x) > 1200 && G.dist(me, x) < 6000 && Math.abs(x.lat - me.lat) < Math.abs(x.lng - me.lng) * 0.6).sort((a, b) => Math.abs(a.lat - me.lat) / Math.abs(a.lng - me.lng) - Math.abs(b.lat - me.lat) / Math.abs(b.lng - me.lng)).slice(0, 10);   // 東西の ゴール（まっすぐ 東西に ちかい 順）
        let goal = 'none', frames = 0, hits = 0, dodged = 0, tried = 0, emoji = null, split = 0;
        for (const g of ew) {
          tried++;
          G.setGuide({ kind: 'spot', id: g.id, name: g.name, why: 'テスト', by: 'テスト' }); await wait(6500); shut();   // 「🏁 つぎの ゴール」の 札が 消えるまで
          for (let n = 0; n < 50 && P.maze.next().on; n++) { await wait(100); shut(); }   // 窓が 開いて いて 札が おくれて 出た ときも（札の 間は 浮かべない）
          let fr = 0, hi = 0, dg = 0;
          for (let k = 0; k < 2; k++) {
            P.floatsClear(); P.floatText(T0);
            for (let i = 0; i < 14; i++) {   // 文字が 浮いて いる 1.2秒の 間、こまごとに
              box = null;
              await new Promise(res => requestAnimationFrame(res));
              const A = P.maze.mapArrow;
              if (box && A) { fr++; if (ov(box, A)) hi++; const sh = P.floatShift; if (sh && (sh[0] || sh[1])) dg++; }
              await wait(60);
            }
          }
          if (hi || dg) {
            goal = g.name; frames = fr; hits = hi; dodged = dg;
            pieces = []; P.floatsClear(); P.floatText(T1);
            for (let i = 0; i < 14; i++) { await new Promise(res => requestAnimationFrame(res)); await wait(60); }
            emoji = pieces.length === 1 ? pieces[0] === T1 : pieces.length === 2 ? pieces.join(' ') === T1 : false; split = pieces.length; pieces = null;
            break;
          }
        }
        // 2だんめ：「🏁 つぎの ゴール」の 札（3秒）の 間は 浮かべず、札が 消えてから 浮かべる（ゴールの あと 待っていた 文字が 札の「めいろで 2.0km」に 重なった）
        const g2 = G.spots.filter(x => x.lat && !x.shop && G.dist(me, x) > 300 && G.dist(me, x) < 2000 && (!G.guide || x.id !== G.guide.id)).sort((a, b) => G.dist(me, a) - G.dist(me, b))[0];
        let during = 0, bannerFrames = 0, after = false;
        if (g2) {
          P.floatsClear(); G.setGuide({ kind: 'spot', id: g2.id, name: g2.name, why: 'テスト', by: 'テスト' });
          for (let i = 0; i < 40 && !P.maze.next().on; i++) await wait(50);
          P.floatText(T0);
          for (let i = 0; i < 160 && !after; i++) {   // 札の 間（3秒 あまり）と その あと
            await new Promise(res => requestAnimationFrame(res)); shut();
            const on = P.maze.next().on, d = P.floatsDrawn.includes(T0);
            if (on) { bannerFrames++; if (d) during++; } else if (d) after = true;
            await wait(30);
          }
        }
        ctx.fillText = keep; P.floatsClear(); G.setGuide(null);
        return { tried, goal, frames, hits, dodged, emoji, split, g2: g2 && g2.name, bannerFrames, during, after };
      });
      await w.page.setViewportSize(vp); await w.page.waitForTimeout(400);
      return { ...r, ok: r.frames > 0 && (r.hits > 0 || r.dodged > 0) && r.hits === 0 && r.emoji === true && r.bannerFrames > 0 && r.during === 0 && r.after };
    })();
    // 浮かぶ 文字は 上の 知らせ（DOM。キャンバスの 上に 重なる）に かくれない：知らせの 下へ ずれるか、消えるまで 待つ（自分で 遊んで 分かった：320×568 で 4行の「🌙 夜のさんぽ…」が「おしい！ ベストまで…」の 1行目を かくした）
    R.checks.floatToast = await (async () => {
      const vp = w.page.viewportSize();
      await w.page.setViewportSize({ width: 320, height: 568 }); await w.page.waitForTimeout(400);
      const r = await w.page.evaluate(async () => {
        const G = nishioGo, P = nishioPixel, wait = ms => new Promise(res => setTimeout(res, ms)), cv = document.getElementById('pxCanvas'), ctx = cv.getContext('2d'), el = document.getElementById('toast');
        document.querySelectorAll('.medashi').forEach(m => { m.hidden = true; }); document.getElementById('pxInfo').hidden = true; const rw = document.getElementById('reward'); if (rw.classList.contains('show')) rw.click();
        G.setGuide(null); await wait(300);
        const T0 = 'おしい！ ベストまで あと1だったじゃん', keep = ctx.fillText;
        let box = null;
        ctx.fillText = function (t, x, y) { if (t.length >= 4 && T0.includes(t)) { const fz = parseFloat((/(\d+(?:\.\d+)?)px/.exec(this.font) || [])[1]) || 16, fw = this.measureText(t).width, b = [x - fw / 2, y - fz, x + fw / 2, y]; box = box ? [Math.min(box[0], b[0]), Math.min(box[1], b[1]), Math.max(box[2], b[2]), Math.max(box[3], b[3])] : b; } return keep.apply(this, arguments); };
        let frames = 0, under = 0, drawn = 0, after = 0;
        for (let k = 0; k < 3; k++) {
          el.classList.remove('wlow', 'low'); el.textContent = '🌙 テストの 知らせ：夜の さんぽ。明かりの まわりしか 見えないよ。たからばこは ほんのり 光っとる（長めの 文で 4行）'; el.classList.add('show');   // 知らせを じかに 出す（ほかの 窓で 待たされて 出ない ことが あった）
          P.floatsClear(); P.floatText(T0);
          for (let i = 0; i < 40; i++) {   // 知らせの 間（3秒）と 消えた あと
            if (i < 30) { el.classList.add('show'); el.classList.remove('wlow'); } else if (i === 30) el.classList.remove('show');   // 前の 知らせの タイマーが 消しても 3秒は 出して おく
            box = null;
            await new Promise(res => requestAnimationFrame(res));
            const show = el.classList.contains('show') && !el.classList.contains('wlow');
            if (box) {
              drawn++;
              if (show) {
                frames++;
                const c = cv.getBoundingClientRect(), q = el.getBoundingClientRect(), s = c.width / cv.width;
                const B = [c.left + box[0] * s, c.top + box[1] * s, c.left + box[2] * s, c.top + box[3] * s];
                if (q.left < B[2] && q.right > B[0] && q.top < B[3] && q.bottom > B[1]) under++;   // 知らせの うしろに かくれた
              } else after++;
            }
            await wait(100);
          }
        }
        ctx.fillText = keep; P.floatsClear(); el.classList.remove('show');
        return { frames, under, drawn, after };
      });
      await w.page.setViewportSize(vp); await w.page.waitForTimeout(400);
      return { ...r, ok: r.under === 0 && (r.frames > 0 || r.after > 0) };   // 知らせの 下へ よけて 出る（frames）か、縁の 矢印に かかって 下へ よけられない ときは 知らせが 消えてから 出る（after）。どちらも かくれない
    })();
    R.errors.push(...w.errors);
    await w.ctx.close();
  }

  // 西尾市の担当者むけの 提案資料（nishio-go/city.html）：数字が ゲームの データから 入り、ドット絵の 枚数が ゲームと 同じ。画面写真・QR が 読める。公式でないと 書いてある
  {
    const w = await newPage(browser);
    await w.page.goto(URL); await w.page.waitForTimeout(1500);
    const count = await w.page.evaluate(() => window.NISHIO_DOTS && NISHIO_DOTS.COUNT);
    await w.page.goto(URL.replace(/nishio-go\.html.*$/, 'nishio-go/city.html')); await w.page.waitForTimeout(1500);
    const info = await w.page.evaluate(() => ({
      nums: Object.fromEntries([...document.querySelectorAll('[data-n]')].map(e => [e.dataset.n, e.textContent])),
      imgs: [...document.querySelectorAll('img')].map(i => [i.getAttribute('src'), i.naturalWidth]),
      notOfficial: /西尾市の公式のものではありません/.test(document.body.textContent),
      demo: (document.querySelector('a.btn') || {}).href || '',
      wide: document.documentElement.scrollWidth <= innerWidth + 1,
    }));
    await shot(w.page, '13-city');
    const n = k => Number(String(info.nums[k] || '').replace(/,/g, ''));
    R.checks.cityPage = { count, ...info, ok: n('spots') > 0 && n('npcs') > 0 && n('events') > 0 && n('dots') === count && info.imgs.every(([, nw]) => nw > 0) && info.notOfficial && /ed=city/.test(info.demo) && info.wide };
    R.errors.push(...w.errors);
    await w.ctx.close();
  }

  await browser.close(); server.close();
  // 競わない 設計：さんぽ仲間は あおらない・勝ち負けで くらべない（運営者の声「競わない設計」2026-10-28）。コメントを のぞいた 文で 見る
  // 歩いた道の 節目の 知らせ：待ちの 列に のこる 前の 節目を 取りのぞく 判定（startsWith）が、いまの 文面の 頭と 合う（文面を 短く した とき 取りのぞけなく なった。Codex の 指摘）
  R.checks.mileCollapse = (() => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'nishio-go', 'game.js'), 'utf8');
    const pre = (/q\[i\]\.startsWith\('(👣[^']*)'\)\) q\.splice/.exec(src) || [])[1], msg = (/toastAfter\(`(👣 [^`$]*)\$\{fmtM\(m\)\}/.exec(src) || [])[1];
    return { pre, msg, ok: !!pre && !!msg && msg.startsWith(pre) };
  })();
  R.checks.noRivalry = (() => {
    const strip = f => fs.readFileSync(path.join(__dirname, '..', 'nishio-go', f), 'utf8').replace(/(^|[^:'"`])\/\/[^\n]*/g, '$1');
    const src = ['game.js', 'pixel.js'].map(strip).join('\n'), bad = ['おそかったじゃん', 'もう見たじゃん', 'まけた！', '勝つと', 'vs${', 'ランキング', '位に'].filter(w => src.includes(w));
    return { bad, ok: bad.length === 0 };
  })();
  // 文字は 少なく（運営者の声「文字は できるだけ 減らして」2026-10-28）：遊びの 知らせ・浮かぶ 文字は 40文字まで。安全・エラーの 知らせだけ 長くて よい
  R.checks.shortText = (() => {
    const long = [], ok = ['乗り物で移動中', 'スポット情報', '保存領域', '生きもの手帳が ぜんぶ', 'あるいて移動では'];
    for (const f of ['game.js', 'pixel.js', 'korostyle.js']) {
      const src = fs.readFileSync(path.join(__dirname, '..', 'nishio-go', f), 'utf8');
      for (const m of src.matchAll(/(?:toast|toastAfter|floatText)\((`[^`]*`|'[^']*')/g)) {
        const t = m[1].slice(1, -1).replace(/\$\{[^}]*\}/g, '○');
        if (t.length > 40 && !ok.some(k => t.includes(k))) long.push(`${f}: ${t.slice(0, 40)}…（${t.length}）`);
      }
    }
    return { long, ok: long.length === 0 };
  })();
  // かかしを とった ときの はじめての 知らせは、浮かぶ 文字（「かかし！ カラスが 8秒 にげる」）と 時計の 下の のこりの 札と 同じ「にげる」を くりかえさない（自分で 遊んで 分かった）
  R.checks.scareToast = (() => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'nishio-go', 'pixel.js'), 'utf8'), m = src.match(/mzScare\.told = true; G\.toast\('([^']*)'\)/);
    const t = m ? m[1] : '';
    return { t, ok: !!t && /かかし/.test(t) && /青く/.test(t) && /おいはらえる/.test(t) && !/にげる/.test(t) };   // かかしで 青く なる つながりは のこす（Codex の 指摘）
  })();
  // かかし・ばねを とった ときは、浮かぶ 文字・時計の 下の のこりの 札・はじめての 知らせの 3か所で 同じ ことを 言わない（自分で 遊んで 分かった：「かかし！ カラスが 8秒 にげる」
  // 「かかし：カラスが にげる あと 8秒」「…おいはらえる」が いちどに 出た。運営者の声「文字は 少なく」）。浮かぶ 文字は みじかく、札は「かかし あと 8秒」、説明は 知らせ だけ
  R.checks.powerWords = (() => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'nishio-go', 'pixel.js'), 'utf8');
    const fl = [...src.matchAll(/(?:floatText|riceSay)\(['`]((?:かかし|ばね)[^'`]*)['`]/g)].map(m => m[1]), tags = [...src.matchAll(/`((?:かかし|ばね)[^`]*あと \$\{[^`]*)`/g)].map(m => m[1]);
    const ok = fl.length === 2 && fl.every(t => t.length <= 8 && !/にげる|はずむ|\$\{/.test(t)) && tags.length === 2 && tags.every(t => /^(かかし|ばね) あと \$\{/.test(t));
    return { fl, tags, ok };
  })();
  // ゴールの 戸の 道さがし（mzGateTry を 小さな 格子で）：戸 4つの 近い 道と、戸 3つで 8歩の 道が ある とき、上限（戸 3つ・歩数 まっすぐの 2倍＋4）以内の 道で 戸を あける
  // （戸と 歩数を 重みに まぜて 1本 だけ えらぶと、戸 4つの 道が えらばれて 上限で はねられ、戸が ひらかなかった。Codex の 指摘）
  // やわらかい 生け垣の へこみの ばね（mzDentStep を 取りだして）：軽く 押しつけて おさまった あと はなれると、へこみは 0 に もどる・押しつけて いる 間は 小さな ゆらぎで 動かない
  // （0.02マスの 遊びを はなれた ときにも かけると、小さな へこみが のこって 生け垣が もどらなかった。Codex の 指摘）
  R.checks.mzDentBack = (() => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'nishio-go', 'pixel.js'), 'utf8'), i = src.indexOf('function mzDentStep'), j = src.indexOf('\nfunction ', i + 10);
    if (i < 0 || j < 0) return { ok: false, why: 'no-func' };
    const soft = { on: true, pen: 0.1, dent: 0, dv: 0 };
    const env = { mzSoft: soft, mazeOn: () => true, calmMotion: false, MZ_SOFT_MAX: 0.4, MZ_DENT_K: Number((src.match(/MZ_DENT_K = ([\d.]+)/) || [])[1]), MZ_DENT_C: Number((src.match(/MZ_DENT_C = ([\d.]+)/) || [])[1]) };
    try {
      const step = new Function(...Object.keys(env), src.slice(i, j) + '; return mzDentStep;')(...Object.values(env));
      for (let k = 0; k < 180; k++) step(1 / 60);   // 強く 押しつけて（へこみ 0.2マス）
      soft.pen = 0.008; for (let k = 0; k < 600; k++) step(1 / 60);   // 軽く 押しつけた まま 10秒（へこみ 0.016マスで おさまる）
      const held = { dent: +soft.dent.toFixed(3), dv: soft.dv };
      let moved = 0; for (let k = 0; k < 120; k++) { soft.pen = 0.008 + (k % 2) * 0.001; const d0 = soft.dent; step(1 / 60); if (soft.dent !== d0) moved++; }   // 押しつけた ままの 小さな ゆらぎ
      soft.on = false; for (let k = 0; k < 600; k++) step(1 / 60);   // はなれて 10秒
      const off = { dent: +soft.dent.toFixed(3), dv: soft.dv };
      return { held, moved, off, ok: held.dv === 0 && moved === 0 && off.dent <= 0.01 && off.dv === 0 };
    } catch (e) { return { ok: false, err: String(e) }; }
  })();
  R.checks.mzGateSearch = (() => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'nishio-go', 'pixel.js'), 'utf8'), i = src.indexOf('function mzGateKey'), j = src.indexOf('function mzBlocked', i);
    if (i < 0 || j < 0) return { ok: false, why: 'no-func' };
    const key = (x, y, dx, dy) => dx + dy < 0 ? key(x + dx, y + dy, -dx, -dy) : `${x},${y}${dx ? 'r' : 'd'}`;
    const run = withShort => {
      const M = new Map(), E = (pts, kind) => { for (let k = 1; k < pts.length; k++) { const [x, y] = pts[k - 1], [u, v] = pts[k]; M.set(key(x, y, u - x, v - y), kind); } };
      E([[2, 0], [2, -1], [2, -2]], 'open'); E([[2, -2], [1, -2]], 'road'); E([[1, -2], [0, -2], [-1, -2]], 'open'); E([[-1, -2], [-1, -1]], 'road'); E([[-1, -1], [0, -1]], 'open'); E([[0, -1], [0, 0]], 'road');   // 8歩・戸 3つ
      if (withShort) E([[2, 0], [2, 1], [1, 1], [0, 1], [0, 0]], 'road');   // 4歩・戸 4つ
      const env = { MZ_DIRS: [[1, 0], [-1, 0], [0, 1], [0, -1]], mzGate: Object.assign(new Map(), { v: 0 }), MZ_GATE_NEAR: 3, MZ_GATE_MAX: 3, mzOpen: (x, y, dx, dy) => M.get(key(x, y, dx, dy)) === 'open', mzType: () => 1, mzCell: () => ({}), mzLinkRaw: (ca, cb, lx, ly, dx, dy) => M.get(key(lx, ly, dx, dy)) === 'road', chordSound() {}, floatText() {}, performance: { now: () => 0 } };
      const f = new Function(...Object.keys(env), src.slice(i, j) + '; return mzGateTry;')(...Object.values(env));
      return { opened: f(2, 0, 0, 0, (x, y) => x === 0 && y === 0, 18), gates: env.mzGate.size };
    };
    try { const both = run(true), only3 = run(false); return { both, only3, ok: both.opened && both.gates === 3 && only3.opened }; } catch (e) { return { ok: false, err: String(e) }; }
  })();
  // 入口（店頭POP・配るカード・ホーム画面に追加）：manifest の 画面写真が あって 形式（Chrome の 追加の 画面は PNG・JPEG だけ）と 大きさが 本当の 絵と 同じ・POP の 写真が ある・カードの QR が POP と 同じ（来た人を 同じ from で 数える）
  // （絵の 大きさは 形式ごとに 頭から 読む。webp は VP8X だけで なく VP8・VP8L も。Codex の 指摘）
  R.checks.entryPrint = (() => {
    const root = path.join(__dirname, '..'), rd = f => { try { return fs.readFileSync(path.join(root, f)); } catch (e) { return null; } };
    const img = b => {
      if (!b || b.length < 30) return null;
      if (b.readUInt32BE(0) === 0x89504e47) return { type: 'image/png', size: `${b.readUInt32BE(16)}x${b.readUInt32BE(20)}` };
      if (b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP') {
        const t = b.toString('latin1', 12, 16), v = b.readUInt32LE(21);
        const size = t === 'VP8X' ? `${1 + b.readUIntLE(24, 3)}x${1 + b.readUIntLE(27, 3)}` : t === 'VP8 ' ? `${b.readUInt16LE(26) & 0x3fff}x${b.readUInt16LE(28) & 0x3fff}` : t === 'VP8L' ? `${(v & 0x3fff) + 1}x${((v >>> 14) & 0x3fff) + 1}` : null;
        return { type: 'image/webp', size };
      }
      if (b[0] === 0xff && b[1] === 0xd8) {
        for (let i = 2; i + 9 < b.length;) {
          if (b[i] !== 0xff) return null;
          const m = b[i + 1];
          if (m === 0xff) { i++; continue; }
          if (m >= 0xd0 && m <= 0xd9 || m === 0x01) { i += 2; continue; }
          if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { type: 'image/jpeg', size: `${b.readUInt16BE(i + 7)}x${b.readUInt16BE(i + 5)}` };
          i += 2 + b.readUInt16BE(i + 2);
        }
      }
      return null;
    };
    try {
      const man = JSON.parse(rd('nishio-go.webmanifest')), shots = man.screenshots || [];
      const bad = shots.filter(s => { const g = img(rd(s.src.slice(1))); return !g || !/^image\/(png|jpeg)$/.test(s.type) || g.type !== s.type || g.size !== s.sizes; }).map(s => s.src);
      const pop = String(rd('nishio-go/pop.html') || ''), card = String(rd('nishio-go/card.html') || '');
      const popImgs = [...pop.matchAll(/<img[^>]*src="([^"]+)"/g)].map(m => m[1]), missing = popImgs.filter(f => !rd('nishio-go/' + f));
      const qr = h => ((h.match(/class="qrline"[^>]*\sd="([^"]+)"/) || [])[1] || '');
      const cards = (card.match(/class="card"/g) || []).length, uses = (card.match(/<use href="#qr"\/>/g) || []).length;
      const same = qr(pop).length > 100 && qr(pop) === qr(card);
      return { shots: shots.length, bad, missing, cards, uses, same, ok: !!man.id && shots.length >= 1 && !bad.length && !missing.length && cards === 10 && uses === 10 && same };
    } catch (e) { return { ok: false, err: String(e) }; }
  })();
  // 合格の条件：どれか1つでも外れたら、理由を failures に書いて終了コード1
  const c = R.checks, fail = [];
  const need = (ok, why) => { if (!ok) fail.push(why); };
  need(R.errors.length === 0, 'ページでエラーが出た');
  need(R.walk.length === 4 && R.walk.every(w => w.reached), 'たからばこか3か所のどこかに着けなかった');
  need(c.padOnWorldMap, 'せかいちずで操作して遊ぶを選んだとき、スティックが出ない');
  need(c.simpleDefault && c.textMore && c.textLessAgain, '文字を少なくする表示がはじめから有効でないか、せってい で切り替わらない');
  need(c.mzCrow && c.mzCrow.ok, 'めいろの カラス（出て 動く・当たると 時計が 5秒 すすむ・せっていで オフ）が はたらかない');
  need((R.walk.find(w => w.id === 'chest') || {}).ribbon?.has && !R.walk.find(w => w.id === 'chest').ribbon.hit, `ごほうびの「NEW」の 札が 名前の 字に 重なる（${JSON.stringify((R.walk.find(w => w.id === 'chest') || {}).ribbon)}）`);
  need(c.wrapWords320 && c.wrapWords320.ok, `知らせ・ごほうびの 名前が ことばの とちゅうで 切れる、または 長い 文が はみ出す（${JSON.stringify(c.wrapWords320)}）`);
  need(c.eventToast && c.eventToast.ok, `イベントの 窓の 上に 知らせが 重なる（${JSON.stringify(c.eventToast)}）`);
  need(c.townNoRoom && c.townNoRoom.ok, `町名の 札：置き場所が ない ときに 重ねて 描く・町が かわっても 待ちを 引きつぐ（${JSON.stringify(c.townNoRoom)}）`);
  need(c.floatArrow && c.floatArrow.ok, `浮かぶ 文字：めいろの 縁の 矢印と 道のりの 札・「つぎの ゴール」の 札に 重ねない（${JSON.stringify(c.floatArrow)}）`);
  need(c.floatToast && c.floatToast.ok, `浮かぶ 文字：上の 知らせの うしろに かくれる（${JSON.stringify(c.floatToast)}）`);
  need(c.townToast && c.townToast.ok, `町名の 札（〜 ○○町 〜）が 上の 知らせに かくれる（${JSON.stringify(c.townToast)}）`);
  need(c.landscape568 && c.landscape568.ok, `横に した 低い 画面（568×320）で はじめの1枚が えらべない・ごほうびの 窓が はみ出す（${JSON.stringify(c.landscape568)}）`);
  need(c.pickFit320 && c.pickFit320.ok, `はじめの1枚の 窓で 3枚の 絵が 320px の 画面に 入りきらない（左右が 切れる）（${JSON.stringify(c.pickFit320)}）`);
  need(c.jumpCard320 && c.jumpCard320.ok, `きろくの にしおジャンプの 札が 細く なる・「あそぶ」が 札の 外に 出る（${JSON.stringify(c.jumpCard320)}）`);
  need(c.codeCardHead && c.codeCardHead.ok, `ひきつぎの あいことばの 見出しと 説明が 同じ 行に つづく（${JSON.stringify(c.codeCardHead)}）`);
  need(c.badgeGrid320 && c.badgeGrid320.ok, `きろくの バッジが 320px の 画面で 列の 幅が そろわない・画面から はみ出す（${JSON.stringify(c.badgeGrid320)}）`);
  need(c.shareToast && c.shareToast.ok, `シェアの 窓の 上に 知らせが 重なる（${JSON.stringify(c.shareToast)}）`);
  need(c.playMore320 && c.playMore320.ok, `320px の「めいろ、どうだった？」の ひとことの 欄が 切れる（${JSON.stringify(c.playMore320)}）`);
  need(c.nextGoalLabel && c.nextGoalLabel.ok, `「つぎの ゴール」の 札に 縁の 矢印の 道のりが かぶる（${JSON.stringify(c.nextGoalLabel)}）`);
  need(c.mzEdgeToast && c.mzEdgeToast.ok, `めいろの 縁の 矢印の 札に 知らせが 重なる（${JSON.stringify(c.mzEdgeToast)}）`);
  need(c.mzEdgeToastWide && c.mzEdgeToastWide.ok, `横向きの 低い 画面で、知らせが めいろの 縁の 矢印と 道のりの 札に 重なる（${JSON.stringify(c.mzEdgeToastWide)}）`);
  need(c.nextGoalToast && c.nextGoalToast.ok, `めいろの「つぎの ゴール」の 札に 知らせが 重なる（${JSON.stringify(c.nextGoalToast)}）`);
  need(c.worldToast && c.worldToast.ok, `せかいちずの「ゴール：…」の 札に 知らせが 重なる（${JSON.stringify(c.worldToast)}）`);
  need(c.spinCompact && c.spinCompact.ok, `めいろの 名所の 札が 1行で ない（小さい 画面で 下の 欄が 大きく のびて めいろが かくれる・長い 名前が はみ出す・短い 名前が 縮んで 読めない）（${JSON.stringify(c.spinCompact)}）`);
  need(c.entryPrint && c.entryPrint.ok, '店頭POP・配るカード・ホーム画面に追加の 画面写真（manifest）の どれかが そろっていない（写真が ない・大きさが ちがう・カードの QR が POP と ちがう）');
  need(c.npcBump && c.npcBump.ok, '人に こつんと 押しつづけると、とじる たびに また 話しかけて しまう');
  need(c.rollStartTilt && c.rollStartTilt.ok, '転がり方「ぴたっ」で 草の 上だと、少し 傾けても お米が 動きださない（めいろで 詰まる）');
  need(c.mzFarWorld && c.mzFarWorld.ok, '遠い ゴールの 矢印を タップしても、せかいちずで ゴールの 場所（🏁）が 見られない');
  need(c.mzSameCellGoal && c.mzSameCellGoal.ok, '同じ めいろの マスの ゴールが つづくと、ゴールが かわった ことに 気づかない（「🏁 つぎの ゴール」が 出ない）');
  need(c.npcArriveBump && c.npcArriveBump.ok, 'めいろの ゴールの 人に 着いて 話した あと、となりから 当たると 同じ 話が また 開く');
  need(c.npcSightBump && c.npcSightBump.ok, 'めいろで 呼びとめられて 話した 人に、そのまま 当たるか はなれて もどると 同じ 話が また 開く');
  need(c.npcBumpInTile && c.npcBumpInTile.ok, 'めいろで 人の そばに 入っても、マスが かわらないと こつんと 話しかけない（同じ マスの 中で 近づいて はなれる と 当たれない）');
  need(c.mzGoalGate && c.mzGoalGate.ok, `ゴールの すぐ そばなのに 道のりが とても 長い 所で、生け垣の 戸が ひらかない（${JSON.stringify(c.mzGoalGate)}）`);
  need(c.mzDentBack && c.mzDentBack.ok, `やわらかい 生け垣：はなれても 小さな へこみが のこる・押しつけた ままの ゆらぎで へこみが 動きつづける（${JSON.stringify(c.mzDentBack)}）`);
  need(c.mzGateSearch && c.mzGateSearch.ok, `ゴールの 戸の 道さがしが、上限 以内の 道を 見のがす（${JSON.stringify(c.mzGateSearch)}）`);
  need(c.rivalNear && c.rivalNear.ok, 'さんぽ仲間が すぐ そばの 次の 行き先へ 先回りする（着いた あとに「先に 行っとる」、すぐ「おそかったじゃん」）');
  need(c.reactNoCount && c.reactNoCount.ok, `みんなの声：反応の 数を 出している（${JSON.stringify(c.reactNoCount)}）`);
  need(c.mzKeepGoal && c.mzKeepGoal.ok, 'めいろの とちゅうで ゴールでない 人と 話すと、ゴールが かわって しまう');
  need(c.mzFarGuide && c.mzFarGuide.ok, 'めいろで 人の すすめや 前の 行き先が 5km 先の 人に なる（めいろでは 着けない）');
  need(c.toastHud && c.toastHud.ok, '地図の 上の 知らせが 右上の 丸い ボタンに 重なる');
  need(c.toastTalk && c.toastTalk.ok, '小さい 画面で、人の 話の 窓が 開いて いる 間の 知らせが 窓（「▶ とじる」）に 重なる');
  need(c.mzBannerFloat && c.mzBannerFloat.ok, 'めいろの「ゴール！」と 頭の 上に 浮かぶ 文字が 同じ ときに 出て、重なって 読めない');
  need(c.kaeru && c.kaeru.ok, `あぜの カエル：10月に 出ない・すわって いない・お米が 近づいても とびこまない・消えない・文字を 出す（${JSON.stringify(c.kaeru)}）`);
  need(c.kisetsuMushi && c.kisetsuMushi.ok, `季節の 虫：10月に 赤とんぼが 出ない・とばない・お米が 近づいても はなれない・消えない・文字を 出す（${JSON.stringify(c.kisetsuMushi)}）`);
  need(c.suzumeVisit && c.suzumeVisit.ok, `ねむって いる お米の そばに すずめが こない・じっと して いる 間に とびたつ・動いても とびたたない（${JSON.stringify(c.suzumeVisit)}）`);
  need(c.neko && c.neko.ok, `ねこ：ねて いない・お米が 近づいても おきない・また ねない・文字を 出す（${JSON.stringify(c.neko)}）`);
  need(c.suzume && c.suzume.ok, `すずめ：2〜3羽 おりない・お米が 近づいても みんなで とびたたない・とびさらない（${JSON.stringify(c.suzume)}）`);
  need(c.shopThanks && c.shopThanks.ok, `当店の ごほうびに「来てくれて ありがとう！」・来店スタンプの 数が 出ない、または 数の ない 札が ならぶ（${JSON.stringify(c.shopThanks)}）`);
  need(c.mzGoalEdge && c.mzGoalEdge.ok, 'ゴールが 画面の はしに ある とき、ゴールの 名前が 画面から はみ出して 切れる');
  need(c.mzArrowTop && c.mzArrowTop.ok, 'ゴールが 上の 外の とき、矢印が 時計の 札や 右上の ボタンに 重なる');
  need(c.mzHintToast && c.mzHintToast.ok, '迷って いる 間、道しるべの 知らせが 25秒ごとに 出つづける');
  need(c.wayChip && c.wayChip.ok, '「まよわず ゴール」の 札が 文字を 少なく で 出ない');
  need(c.mzArrive && c.mzArrive.ok, 'めいろの ゴール（名所・人）に 着いても そのまま ゴールに ならない');
  need(c.mzScare && c.mzScare.ok, 'めいろの かかし（立つ・とると カラスが にげる・さわると おいはらえる）が はたらかない');
  need(c.scareToast && c.scareToast.ok, `かかし：はじめての 知らせが 浮かぶ 文字と 同じ「にげる」を くりかえす（${JSON.stringify(c.scareToast)}）`);
  need(c.powerWords && c.powerWords.ok, `かかし・ばねを とった ときに 同じ ことを 3か所で 言う（浮かぶ 文字が 長い・札が「〇〇 あと 8秒」で ない。${JSON.stringify(c.powerWords)}）`);
  need(c.shortText && c.shortText.ok, `文字は 少なく：遊びの 知らせ・浮かぶ 文字が 40文字を こえる（${JSON.stringify(c.shortText)}）`);
  need(c.riceBreath && c.riceBreath.ok, `止まって いる お米が すう すう 息を しない（${JSON.stringify(c.riceBreath)}）`);
  need(c.godotRec && c.godotRec.ok, `Godot の 記録係で 歩く地図を 描くと とちゅうで 止まる（?godot=1。記録係に ない canvas の 命令）（${JSON.stringify(c.godotRec)}）`);
  need(c.riceBfly && c.riceBfly.ok, `ねむって いる お米の 頭に ちょうちょが とまらない（${JSON.stringify(c.riceBfly)}）`);
  need(c.riceWake && c.riceWake.ok, `ねむって いた お米が おきても のびを しない（または ちょうちょが 飛んで いかない）（${JSON.stringify(c.riceWake)}）`);
  need(c.comboTen && c.comboTen.ok, `ころころ ×10 で 文字が 出る（お米の よこの ×N と 同じ ことを 2か所に 書いている）か、大きな きらきらが 出ない（${JSON.stringify(c.comboTen)}）`);
  need(c.ricePerf && c.ricePerf.ok, `お米を 描くのが 重すぎる（1回 6ミリ秒 より 長い）（${JSON.stringify(c.ricePerf)}）`);
  need(c.dropSmooth && c.dropSmooth.ok, `水の しずくが なめらかに 描けていない（${JSON.stringify(c.dropSmooth)}）`);
  need(c.toastSnap && c.toastSnap.ok, `窓が 開いても 知らせが すぐ 消えず、窓の 上に かぶる（${JSON.stringify(c.toastSnap)}）`);
  need(c.smoothShadow && c.smoothShadow.ok, `お米の 影が なめらかに 描けていない（点の 四角の まま）（${JSON.stringify(c.smoothShadow)}）`);
  need(c.smoothRice && c.smoothRice.ok, `お米が なめらかに 描けていない（画面の 細かさ・ふちの ぼかし・連続の 影・点より 細かい 位置）（${JSON.stringify(c.smoothRice)}）`);
  need(c.babyRice && c.babyRice.ok, `お米の 赤ちゃんの かわいさ：目の きらっ・あくびが ない（${JSON.stringify(c.babyRice)}）`);
  need(c.mileCollapse && c.mileCollapse.ok, `歩いた道の 節目：前の 節目の 知らせを 待ちの 列から 取りのぞけない（文面の 頭が ちがう）（${JSON.stringify(c.mileCollapse)}）`);
  need(c.noRivalry && c.noRivalry.ok, `競わない 設計：あおる ことば・勝ち負けが のこっている（${JSON.stringify(c.noRivalry)}）`);
  need(c.mzHelpAfterBanner && c.mzHelpAfterBanner.ok, 'おたすけの 知らせが「🏁 つぎの ゴール」の 大きな 文字に 重なって 出る（ゴールの 名前が かくれる）');
  need(c.mzHelp && c.mzHelp.ok, 'めいろの おたすけ（はじめは 自動で 道しるべと ✕・せっていで オフ・ゴール 3回で 自動は おしまい）が はたらかない');
  need(c.cityPage && c.cityPage.ok, '西尾市むけの 提案資料（city.html）の 数字・画面写真・QR が 出ないか、ドット絵の 枚数が ゲームと ちがう');
  need(c.komeTalk && c.komeTalk.ok, `お米つぶの おはなし：あいさつ→「つぎは どこへ 行く？」→ えらぶと 行き先が かわる・せっていで オフ（${JSON.stringify(c.komeTalk)}）`);
  need(c.howtoFirst && c.howtoFirst.ok, 'はじめて めいろに 入った人に「あそびかた」が 出ないか、とじても 転がらないか、2回目も 出る（または せっていから 見られない・読んでいる 間の ごほうびが うしろに 重なる）');
  need(c.firstOnField && c.welcomeChestM !== null && c.welcomeChestM <= 150, 'はじめての人が歩く地図から始まらないか、近くに ようこそ たからばこ がない');
  need(c.controlsGone, 'めいろに いらない ボタン・せってい（スティック・📱・🚗・地図の 切りかえ・ドット絵の地図・Godot）が のこっている');
  need(c.rollKeyLeavesWorld, '転がす ときに せかいちずで 矢印キーを 押しても 歩く地図に もどらない');
  need(c.keyWalkedNorth, '矢印キーの上で 北へ 歩かない（せかいちずから 歩く地図に もどらない）');
  need(c.tapWalk === true, '地面をタップしても、そこまで歩かない');
  need(c.tapWalkStopsOnPanel === true, 'タップした所へ歩くとちゅうで きろく を開いても、うしろで歩きつづける');
  need(c.tapWalkStopsOnTouch === true, 'タップした所へ歩くとちゅうで 地図の外（こよみの札）をさわっても、うしろで歩きつづける');
  need(String(c.tapWalkStopsOnCover) === 'reward,a2hs', 'タップした所へ歩くとちゅうで ほうびの知らせや ホーム画面に追加 の案内が出ても、うしろで歩きつづける');
  need(c.operateMode && c.bgmStarted && c.checkinSound && c.cooldown && c.shopCard && c.worldBgm && c.walkMode && c.reactOffTab, '操作・音・当店の案内・あるいて移動のどれかが動かない');
  need(c.rewardTapClose === true, 'ほうびの知らせがチェックインのあとに出ないか、タップで消えない');
  need(c.chestsNearby > 0, 'たからばこが置かれていない');
  need(c.movieAfterShare && c.movieAfterShare.ok, 'ドット絵ムービーが シェアの 画面の 上に 出て かくす');
  need(c.movieAfterReward && c.movieAfterReward.ok, 'ドット絵ムービーが ごほうびの 窓の 上に すぐ 出て、ごほうびを かくす');
  need(c.movieOpen === true && c.movieDone === true, 'ドット絵ムービー：八ツ面山でチェックインしても流れないか、最後まで見ても まちメモ に残らない');
  need(c.roll && c.roll.ok, 'かたむけて転がす：お米が転がらない（または絵が回らない）');
  need(c.slope && c.slope.ok, '坂：平らな所で動く、または 下り坂で ひとりでに転がらない');
  need(c.guideRecord && c.guideRecord.ok, 'ガイドさんの記録：西尾城跡のガイドさんの話に、つぎのレベルまでの ポイントと しるしの数が出ない');
  need(c.kiraFar && c.kiraFar.ok, '遠いほど めずらしい：西尾城跡から 8km をこえても、キラが出やすい知らせが出ない');
  need(c.alley && c.alley.ok, '路地の行き止まり：道が終わるマスに入っても 見つけものが出ない（または 同じマスで2回出る）');
  need(c.sealPick && c.sealPick.ok, 'しるしの2枚：2枚から えらぶ窓が出ない、または えらんだ1枚が キラで入らない');
  need(c.critterSure && c.critterSure.ok, 'はじめての出会い・のこりの数：まだ会っていないのに25歩で出会わない、100歩で出会わない、または 田んぼに入っても のこりの数が出ない');
  need(c.waitFact && c.waitFact.ok, '位置を待つ間の まちメモ：位置を待つ間に まちメモが出ない・かわらない、または 届いたあとも残る・届いた知らせが出ない');
  need(c.waterWatch && c.waterWatch.ok, '水べで じっと見る：水の となりで 止まっていても 生きものに出会わない');
  need(c.h100FirstDay === true, 'きょうの100歩たんけん：遊びはじめた日に始まった');
  need(c.h100 && c.h100.ok, 'きょうの100歩たんけん：100歩 歩いても おわらない、または はじめての道の数・自己ベストが残らない');
  need(c.sealPage && c.sealPage.ok, 'しるしをくれる人：一色の おかみさんの話に、しるしまで あと何か所かが出ない');
  need(c.bigText && c.bigText.ok, `プレイ画面の 字が 小さい（時計の 字・浮かぶ 文字・れんさの 小さい 字）（${JSON.stringify(c.bigText)}）`);
  need(c.chain && c.chain.ok, 'めぐりの れんさ：30分以内に ちがう名所でチェックインしても れんさが つながらない');
  need(c.trailMile && c.trailMile.ok, '歩いた道の節目：500m を歩いても 節目のお祝いが出ない');
  need(c.rollVert && c.rollVert.ok, `たての 転がり方：上・下へ 転がっても でんぐりがえし しない（${JSON.stringify(c.rollVert)}）`);
  need(c.cornerAssist && c.cornerAssist.ok, `曲がり角アシスト：めいろの 曲がり角で、横に ずれていると 曲がれない（${JSON.stringify(c.cornerAssist)}）`);
  need(c.yuruMeiro && c.yuruMeiro.ok, `ゆるい めいろ：次の 向きだけ 押すと 筒から はみ出す・角で 止まって 進めない（${JSON.stringify(c.yuruMeiro)}）`);
  need(c.yuruSpring && c.yuruSpring.ok, `ばねの わざ：とれない・とっても 速く はね返らない・速く なりすぎる・時間が すぎても もどらない（${JSON.stringify(c.yuruSpring)}）`);
  need(c.yuruSoft && c.yuruSoft.ok, `やわらかい 生け垣：当たっても のびない・のびた ことが 見えない・へこみの ゆれが おさまらない・ぽよんと 鳴らない・はね返らない・へこみの 奥で 固まる・通りぬける（${JSON.stringify(c.yuruSoft)}）`);
  need(c.rollCombo && c.rollCombo.ok, `ころころコンボ：かべに 当たらずに 転がっても 数が ふえない／当たっても もどらない（${JSON.stringify(c.rollCombo)}）`);
  need(c.comboBest && c.comboBest.ok, `ころころコンボの ベスト：こえても その場で 知らせない／止まっても ベストが のこらない（${JSON.stringify(c.comboBest)}）`);
  need(c.comboBestOnce && c.comboBestOnce.ok, `ころころコンボ：ベストを こえた 数の まま おわると 同じ 数の ベストを 2回 出す（${JSON.stringify(c.comboBestOnce)}）`);
  need(c.comboTag && c.comboTag.ok, `ころころコンボの ベストの 札が「🏅9」「🏅」に なって いない（文字で「ベスト 9」「ベスト こうしん中」と 書いて いる。${JSON.stringify(c.comboTag)}）`);
  need(c.speedLines && c.speedLines.ok, `スピード線：速くても 出ない／おそく なっても 消えない（${JSON.stringify(c.speedLines)}）`);
  need(c.mazePad && c.mazePad.ok, `びゅんパネル：矢印の 向きに 傾けても おされない／逆から 来ても おされる（${JSON.stringify(c.mazePad)}）`);
  need(c.mazeDots && c.mazeDots.ok, `ごはんつぶの 列：ふれても ひろえない／ぜんぶ ひろっても 列が そろわない（${JSON.stringify(c.mazeDots)}）`);
  need(c.noGoalMap && c.noGoalMap.ok && c.noGoalMapApi && c.noGoalMapApi.ok, `ゴールまでの めいろ図が のこって いる（${JSON.stringify([c.noGoalMap, c.noGoalMapApi])}）`);
  need(c.coupon100 && c.coupon100.ok, `特典の 100円引き：有効時間が 10分で ない／条件「お米1袋につき1回まで」「売り出し期間中は使えません」「LINE のクーポンとは併用できません」が クーポン・特典の 札に 出ない・クーポン画面に 知らせが 重なる（${JSON.stringify(c.coupon100)}）`);
  need(c.friendVs && c.friendVs.ok, `友だちの シェア（?vs=）から 来た 人に 友だちの タイムで さそう・はじめての ゴールで ならべる 知らせが 出ない（${JSON.stringify(c.friendVs)}）`);
  need(c.mazeSpeed && c.mazeSpeed.ok, `めいろの はやさの ベスト（道のり ÷ 時間）が 出ない・札に ならない（${JSON.stringify(c.mazeSpeed)}）`);
  need(c.arriveMsg && c.arriveMsg.ok, `行き先に 着いた ときの 知らせが 長い（つぎの 行き先・めいろで ゴールの 名前を くりかえす。${JSON.stringify(c.arriveMsg)}）`);
  need(c.goalConfetti && c.goalConfetti.ok, `ゴールの 紙ふぶきが お米つぶ・抹茶の 葉・金の つぶで ない（${JSON.stringify(c.goalConfetti)}）`);
  need(c.playRating && c.playRating.ok, `めいろの ゴールの あとの「めいろ、どうだった？」（★と ひとこと）が 出ない・届かない・同じ 日に また たずねる（${JSON.stringify(c.playRating)}）`);
  need(c.mzGoalShare && c.mzGoalShare.ok, `めいろの ゴールで「📣 シェア」→ 遊んだ 画面の カードと すぐ 遊べる リンク（?play=1）が 出ない・別の ごほうびに 持ちこす・人の ゴールで 出ない（${JSON.stringify(c.mzGoalShare)}）`);
  need(c.koroRec && c.koroRec.ok, `きろくに ころころの きろく（コンボの ベスト・きょうの つぶ）・シェアが 出ない（${JSON.stringify(c.koroRec)}）`);
  need(c.rollFeel && c.rollFeel.ok, '転がり方：はなしても なかなか止まらない、または かべに押しつけると がたがたする');
  need(c.mazeWallFit && c.mazeWallFit.ok, 'めいろの 壁：お米が 壁に 食いこんで 見える（当たり判定が 絵より 小さい）、または はね返らない');
  need(c.heightJump && c.heightJump.ok, '高低差で とぶ：急な下り坂の へりを 速く こえても とばない');
  need(c.koroStyles && c.koroStyles.ok, '転がり方 200：数・名前・ずかん が おかしい');
  need(c.koroDist && c.koroDist.ok, `転がり方を もらう 道のり：ひとっとびを 数える か、1マスずつ 歩いても 数えない（${JSON.stringify(c.koroDist)}）`);
  need(c.meiroMain, 'はじめの画面の いちばん上が「🌀 傾けて めいろ」で ない');
  need(c.mapMaze && c.mapMaze.ok, `地図の めいろ：転がすときに 地図が めいろに ならない（${JSON.stringify(c.mapMaze)}）`);
  need(c.meiroLand && c.meiroLand.ok, `盤の めいろ（横向き）：ボタンが 画面の 外・スクロール する・盤が 小さい・強く 当たっても ぽよんと 鳴らない／そっと 当たって 鳴る・へこみが ぷるぷる しない・ばねで 速く はね返らない（${JSON.stringify(c.meiroLand)}）`);
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
  need(c.medashiSeason && c.medashiSeason.ok, `芽出しの見きわめが 季節の ちがう 月（冬・秋）に 出る／春に 出ない：${JSON.stringify(c.medashiSeason)}`);
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
