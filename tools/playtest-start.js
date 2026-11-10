// 開始・傾きの 回帰。実機の センサー体感ではなく、ブラウザへ 送る 合成イベントで 確かめる。
const fs = require('fs'), path = require('path');
async function runStartChecks(browser, url, out, { shareOnly = false } = {}) {
  const checks = {}, errors = [];
  async function fresh(kind = 'normal', viewport = { width: 390, height: 780 }, suffix = '') {
    const ctx = await browser.newContext({ viewport, hasTouch: kind !== 'desktop' });
    await ctx.addInitScript(kind => {
      const legacy = kind.startsWith('legacy-');
      kind = kind.replace('legacy-', '');
      if (legacy) Object.defineProperty(navigator, 'userActivation', { value: undefined, configurable: true });
      window.__asks = 0;
      if (!window.DeviceOrientationEvent) return;
      if (kind === 'normal') DeviceOrientationEvent.requestPermission = undefined;
      if (kind === 'unsupported') window.DeviceOrientationEvent = undefined;
      else if (kind !== 'normal') DeviceOrientationEvent.requestPermission = () => {
        window.__asks++;
        if (kind.startsWith('notallowed') && window.__asks === 1) {
          const e = new DOMException('gesture needed', 'NotAllowedError');
          if (kind === 'notallowed-sync') throw e;
          return Promise.reject(e);
        }
        if (kind === 'throws') throw new Error('sensor unavailable');
        if (kind === 'rejected') return Promise.reject(new Error('denied'));
        return new Promise(resolve => setTimeout(() => resolve((kind === 'granted' || kind.startsWith('notallowed')) ? 'granted' : 'denied'), 200));
      };
    }, kind);
    const page = await ctx.newPage();
    page.on('pageerror', e => errors.push(e.message));
    await page.route('https://**/*', r => {
      const u = r.request().url();
      if (u.startsWith('https://unpkg.com/') && process.env.LEAFLET_DIR) {
        const css = u.endsWith('.css');
        return r.fulfill({ body: fs.readFileSync(path.join(process.env.LEAFLET_DIR, css ? 'leaflet.css' : 'leaflet.js')), contentType: css ? 'text/css' : 'text/javascript' });
      }
      return r.abort();
    });
    await page.goto(url + suffix);
    await page.waitForFunction(() => window.nishioPixel && window.nishioGo && nishioGo.started && nishioPixel.roll.ready);
    return { ctx, page };
  }
  // 「あそぶ」の 窓（playReady）は なくなった（運営者の声 2026-10-31。nishio-go/meiro.js・pixel.js の「あそぶ ボタン廃止」）。
  // いまの きまり（サイクル194 から）：開始を 止める 窓は ない／自動で 始まる ときは 傾きの 許可を 求めない／地図の タップでも 求めない／傾きの ボタン（#pxTilt）の 本当の タップで 1回だけ 求める（NotAllowedError の ときだけ 次の タップで もう1回）
  const visible = page => page.evaluate(() => ({ intro: !document.getElementById('intro').hidden, help: !document.getElementById('howto').hidden, panel: !!document.querySelector('#playReady, #playReadyOk'), playing: !!(nishioGo.started && nishioGo.demo && nishioPixel.roll.ready && !nishioPixel.mapCovered(true)), talk: !!document.querySelector('#komeTalk:not([hidden])'), asks: window.__asks }));
  const shot = (page, name) => page.screenshot({ path: path.join(out, `start-${name}.png`) });
  // 本当の タップ（isTrusted）を 地図に 送る。ほかの 窓が かぶって いたら 先に 閉じる（かぶった ままだと 地図に とどかない）
  const tapMap = async (page, x = 150, y = 150) => {
    await clearOverlays(page);
    const hit = await page.evaluate(([x, y]) => { const cv = document.getElementById('pxCanvas'), r = cv.getBoundingClientRect(); return document.elementFromPoint(r.left + x, r.top + y) === cv; }, [x, y]);
    if (!hit) throw new Error('map tap blocked');
    await page.click('#pxCanvas', { position: { x, y } });
    await page.waitForTimeout(300);
  };
  for (const kind of (shareOnly ? [] : ['normal', 'unsupported', 'desktop', 'granted', 'denied', 'throws', 'rejected', 'notallowed', 'notallowed-sync'])) {
    const { ctx, page } = await fresh(kind);
    try {
      await page.waitForTimeout(400);
      const before = await visible(page);
      await shot(page, kind);
      // サイクル194（運営者の声 2026-11-10「スタート時に反応せず、タップすると動作許可が出る挙動を改善」）：
      // 地図の タップでは 求めない（歩く だけ）。許可の いる スマホには 傾きの ボタン（#pxTilt）が 出て、それを 押した ときだけ 1回 求める。許可の いらない 端末・タッチの ない 端末には ボタンを 出さない
      const tiltSt = () => page.evaluate(() => { const b = document.getElementById('pxTilt'), t = nishioPixel.meiroApi.tilt(), r = b.getBoundingClientRect(); return { asks: window.__asks, asked: !!t.asked, retry: !!t.retry, btn: !b.hidden && r.width > 0, cls: b.className, text: b.textContent.trim(), saved: localStorage.getItem('nsg_tilt_ok') }; });
      const tapTilt = async () => { await clearOverlays(page); if (!(await tiltSt()).btn) return false; await page.click('#pxTilt'); await page.waitForTimeout(300); return true; };
      // 止まって いる ときの 手本：何も さわらずに 2秒ほどで 指の 手本が 出る。地図を タップすると 消え、また 止まると 出る（はじめての 人 だけで なく、何回でも）
      // （地図の タップで 歩いて いる 間は 手本は 出ない。歩きおわるのを 待ってから、止まって 何秒で 出るかを はかる。下の 合成クリックは 遠くへ 歩きだすので、その 前に）
      const demoOn = async t => { await page.waitForFunction(() => !nishioPixel.tapGoal, null, { timeout: 20000 }).catch(() => {}); await clearOverlays(page).catch(() => {}); const t0 = Date.now(); const on = await page.waitForFunction(() => nishioPixel.tapDemo.on, null, { timeout: t }).then(() => true, () => false); return on ? Date.now() - t0 : -1; };
      const early = await tiltSt();   // 開いて すぐ：名前つきの ボタン（20秒 たつと 📱 だけに なる）
      // 合成の クリック・引数なし（タイマーや 自動openと 同じ）では 求めない。本当の タップより 前に 見る（Codex 指摘 PR #1083：タップの あとでは もう 聞いた あとで、合成からの 新しい 要求を 防げるかが 分からない）
      const synthetic = await page.evaluate(() => {   // この 前に 本当の タップで もう 聞いて いる ことが ある（サイクル195）ので、ここでの 増えた ぶんで 見る
        const a0 = window.__asks, k0 = !!nishioPixel.meiroApi.tilt().asked;
        nishioPixel.meiroApi.tiltAsk(); nishioPixel.meiroApi.tiltAsk(new Event('click'));
        document.getElementById('pxCanvas').dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 5, clientY: 5 }));
        document.dispatchEvent(new Event('touchend', { bubbles: true }));
        return { asks: window.__asks - a0, asked: !!nishioPixel.meiroApi.tilt().asked !== k0 };
      });
      await clearOverlays(page).catch(() => {}); await page.click('header.bar .brand'); await page.waitForTimeout(100);   // 合成クリックで 遠くへ 歩きだした ぶんを 止める（歩きおわるのを 待つと 1とおりに 25秒 かかる）
      if (['normal', 'granted', 'denied'].includes(kind)) {   // 手本は 3とおりで 見る（許可の いらない 端末・許可する 人・ことわる 人）
      const d1 = await demoOn(4000), n1 = await page.evaluate(() => nishioPixel.tapDemo.n), w1 = await page.evaluate(() => ({ wait: nishioPixel.tapDemo.wait, sight: nishioPixel.sightBusy(), cover: [...document.querySelectorAll('#pxInfo:not([hidden]), .panel:not([hidden]), #intro:not([hidden]), [role="dialog"]:not([hidden]), .medashi:not([hidden])')].map(e => e.id || e.className) }));
      for (let i = 0; i < 6; i++) { try { await tapMap(page); break; } catch (e) { if (i === 5) throw e; await page.waitForTimeout(1500); } }   // 呼びとめ などの 窓が 出て いたら とじるまで 待つ
      const dOff = await page.evaluate(() => !nishioPixel.tapDemo.on);
      // タップした 所は めいろの 道のりで 遠い ことが ある（歩きおわるまで 20秒 より 長い）。地図の 外（上の バー）を さわって 歩くのを 止めてから はかる
      await page.click('header.bar .brand'); await page.waitForTimeout(100);
      const d2 = await demoOn(4000), n2 = await page.evaluate(() => nishioPixel.tapDemo.n);
      const dBox = await page.evaluate(() => { const e = document.getElementById('tapDemo'); if (!e) return { pe: '', hit: false, wait: nishioPixel.tapDemo.wait }; return { pe: getComputedStyle(e).pointerEvents, hit: (() => { const r = e.getBoundingClientRect(); return document.elementFromPoint(r.left + r.width / 2, r.top + 4) === document.getElementById('pxCanvas'); })() }; });
      checks[kind + 'IdleDemo'] = { d1, dOff, d2, n1, n2, w1, ...dBox, ok: d1 >= 0 && d1 <= 3500 && dOff && d2 >= 0 && d2 <= 3500 && n2 > n1 && dBox.pe === 'none' && dBox.hit };   // d1・d2：止まってから 手本が 出るまでの ミリ秒（2秒＋こまの 遅れ）
      }
      if (kind.startsWith('notallowed')) await page.waitForTimeout(800);   // やりなおしは 次の タップで（同じ 指の 動きの 中では しない。0.7秒）
      await tapMap(page); if (kind.startsWith('notallowed')) await page.waitForTimeout(800); await tapMap(page, 170, 170);
      const mapOnly = await tiltSt();   // 地図を 2回 タップした あと（サイクル195）：許可の いる スマホでは 最初の タップで 1回 求めて いる（一時的な 失敗の あとは 次の タップで もう 1回）
      const touchPerm = !['normal', 'unsupported', 'desktop'].includes(kind);
      const btn0 = early.btn, lab0 = /\blab\b/.test(early.cls);
      await tapTilt();
      const first = await tiltSt();
      // Codex 指摘（PR #1072）：ことわられた・例外の ときは、本当の タップの あとに 出る 知らせを 画面で 読む（文字列を ソースから 読む だけでは、呼ばれなく なっても 分からない）
      let deniedMsg = null;
      if (['denied', 'throws', 'rejected'].includes(kind)) {
        await page.waitForFunction(() => /タップ/.test(document.getElementById('toast').textContent), null, { timeout: 3000 }).catch(() => {});
        const text = await page.evaluate(() => document.getElementById('toast').textContent);
        deniedMsg = { text, ok: /地図を タップして 遊べるよ/.test(text) && !/矢印キー|キーボード/.test(text) };
        checks[kind + 'Msg'] = deniedMsg;
      } else if (kind === 'granted') {
        await page.waitForTimeout(500);
        const text = await page.evaluate(() => document.getElementById('toast').textContent);
        const okShown = await tiltSt();   // 「📱 OK」と 出て いる
        checks[kind + 'Msg'] = { text, okText: okShown.text, ok: !/地図を タップして 遊べるよ/.test(text) && (/OK/.test(okShown.text) || !okShown.btn) };   // 許可は 地図の タップで すんで いる：「OK」か、もう 消えて いる   // 許可された ときは 出さない
      }
      await tapTilt();
      const second = await tiltSt();
      await page.waitForTimeout(kind === 'granted' || kind.startsWith('notallowed') ? 2200 : 300);   // 許可：「OK」の あと ボタンが 消えるまで
      for (let i = 0; i < 6; i++) await tapMap(page, 150 + (i % 2) * 20, 150 + (i % 2) * 20);
      await tapTilt(); await tapTilt();
      const after = await visible(page), last = await tiltSt();
      const syntheticOk = synthetic.asks === 0 && !synthetic.asked, mapWant = !touchPerm ? 0 : kind.startsWith('notallowed') ? 2 : 1, mapOk = mapOnly.asks === mapWant && mapOnly.asked === (mapWant > 0);
      if (kind.startsWith('notallowed')) {
        // 一時的に 操作と 認められなかった（NotAllowedError）：次の 本当の タップ（地図）で 1回だけ やりなおす（ことわった とは おぼえない）。許可の あとは ボタンが 消え、もう 求めない
        checks[kind + 'Retry'] = { synthetic, mapOnly, first, second, last, ok: syntheticOk && mapOk && btn0 && lab0 && first.asks === 2 && first.asked && !first.retry && first.saved === '1' && second.asks === 2 && last.asks === 2 && last.asked && !last.btn && last.saved === '1' };
      } else if (kind === 'granted') {
        // 許可：最初の 地図タップで 1回だけ。ボタンは 消え、何回 タップしても 2回目は ない。つぎの ために おぼえる
        checks[kind + 'NoRetry'] = { synthetic, mapOnly, first, second, last, ok: syntheticOk && mapOk && btn0 && lab0 && first.asks === 1 && first.asked && !first.retry && second.asks === 1 && last.asks === 1 && !last.retry && !last.btn && last.saved === '1' };
      } else if (touchPerm) {
        // 拒否・例外：最初の 地図タップで 1回だけ。ボタンは 小さく のこるが、何回 押しても 2回目は 求めない
        checks[kind + 'NoRetry'] = { synthetic, mapOnly, first, second, last, ok: syntheticOk && mapOk && btn0 && lab0 && first.asks === 1 && first.asked && !first.retry && second.asks === 1 && last.asks === 1 && !last.retry && last.btn && /\bquiet\b/.test(last.cls) && !/\blab\b/.test(last.cls) && last.saved === '0' };
      } else {
        // 許可の いらない 端末・センサーの ない 端末・タッチの ない 端末：ボタンを 出さない。どの タップでも 求めない
        checks[kind + 'NoAsk'] = { synthetic, mapOnly, first, last, ok: syntheticOk && mapOk && !btn0 && !first.btn && !last.btn && first.asks === 0 && last.asks === 0 && !last.asked };
      }
      const permission = touchPerm;
      const fallback = ['denied', 'throws', 'rejected', 'unsupported', 'desktop'].includes(kind) ? await movementWithClear(page, false) : { ok: true };
      checks[kind + 'Controls'] = fallback;
      fs.writeFileSync(path.join(out, 'start-progress.json'), JSON.stringify(checks, null, 2));
      // 保存した 設定・進行を 読みなおしても 消さない。開始連打で ポイントも 増えない。
      const saved = await page.evaluate(() => {
        localStorage.setItem('nsg_tilt', '16');   // 傾きの 強さは 9・12・16 の 3段に なった（運営者の声 2026-10-31「傾き感度上げる」。pixel.js の TILT_DEGS）。はじめの 値（12）で ない 16 を 入れて、読みなおしで 消えない ことを 見る
        localStorage.setItem('nsg_start_test', 'keep');
        localStorage.setItem('nsg_state', JSON.stringify({ v: 1, points: 789, total: 789 }));
        const key = nishioGo.stateKey, data = nishioGo.state;
        data.points = 123; data.total = 456; data.welcomed = true;
        // 移動の 検査で100m直前にいると、再開の位置合わせで正規の歩行ボーナスが入る。保存検査は境界から離す（一致条件は変えない）。
        data.walkCarry = 0;
        nishioGo.setGuide(data.guide); return key;
      });
      await page.reload(); await page.waitForFunction(() => window.nishioPixel && nishioGo.started);
      await page.waitForTimeout(400);
      const revisit = await visible(page);   // 読みなおし：窓は 出ない・自動では 求めない
      const persistence = await page.evaluate(() => {
        for (let i = 0; i < 10; i++) nishioGo.begin(true);
        const points = nishioGo.state.points, total = nishioGo.state.total, tilt = localStorage.getItem('nsg_tilt'), marker = localStorage.getItem('nsg_start_test'), legacyPoints = JSON.parse(localStorage.getItem('nsg_state')).points;
        return { points, total, tilt, marker, legacyPoints, kept: points === 123 && total === 456 && tilt === '16' && localStorage.getItem('nsg_tilt_v') === '2' && marker === 'keep' && legacyPoints === 789 };
      });
      const kept = persistence.kept;
      await page.goto('about:blank'); await page.goBack(); await page.waitForFunction(() => window.nishioPixel && nishioGo.started);
      const back = await page.evaluate(key => !!localStorage.getItem(key) && nishioGo.state.points === 123 && document.getElementById('howto').hidden, saved);
      // 読みなおした あとも、最初の 地図タップで 1回だけ（ページを 開く たびに 1回）。タップで 歩くと たからばこ などで ポイントが かわるので、上の 保存の 確かめの あとで
      await page.waitForTimeout(400);
      const reask0 = await page.evaluate(() => window.__asks);
      await tapMap(page); if (kind.startsWith('notallowed')) await page.waitForTimeout(800); await tapMap(page, 170, 170);
      const reaskMap = await page.evaluate(() => window.__asks) - reask0;   // 読みなおした あと：前に 許可した 人には 最初の 地図タップで 聞く。前に ことわった 人には 地図の タップでは 聞かない（サイクル195）
      const savedNow = await page.evaluate(() => localStorage.getItem('nsg_tilt_ok')), reaskMapWant = !permission || (reask0 === 0 && reaskMap === 0 && savedNow === '0') ? 0 : kind.startsWith('notallowed') ? 2 : 1;
      const again = await tiltSt();   // 前の 答えを おぼえて いる：許可した 人には 目立たせる（pro）、ことわった 人には 小さく（quiet）
      const remembered = !permission ? !again.btn : again.saved === '1' ? (!again.btn || /\bok\b/.test(again.cls)) : /\bquiet\b/.test(again.cls) && !/\blab\b/.test(again.cls);   // 許可した 人：地図の タップで もう 許可ずみ（ボタンは「OK」か 消えて いる）
      await tapTilt(); await tapTilt();
      await page.waitForTimeout(300);
      const reask = await page.evaluate(() => window.__asks) - reask0, reaskWant = !permission ? 0 : kind.startsWith('notallowed') ? 2 : 1;
      const wantAsks = !permission ? 0 : kind.startsWith('notallowed') ? 2 : 1;
      checks[kind] = { before, after, revisit, kept, back, persistence, reask0, reaskMap, again, remembered, reask, ok: !before.intro && !before.help && !before.talk && !before.panel && before.playing && before.asks === 0 && !after.panel && after.asks === wantAsks && !revisit.help && !revisit.intro && !revisit.panel && revisit.asks === 0 && reask0 === 0 && reaskMap === reaskMapWant && (permission ? reaskMap > 0 : reaskMap === 0) && remembered && reask === reaskWant && kept && back };
    } finally { await ctx.close(); }
  }
  // UserActivation API が ない 端末でも、共有リンクの 自動openから 許可を 求めない。
  for (const link of ['1', 'daily']) for (const outcome of ['granted', 'denied', 'notallowed']) {
    const { ctx, page } = await fresh('legacy-' + outcome, { width: 390, height: 780 }, '?meiro=' + link);
    try {
      await page.waitForFunction(() => window.NISHIO_MEIRO && NISHIO_MEIRO.game && document.getElementById('meiro') && !document.getElementById('meiro').hidden);
      const automatic = await page.evaluate(() => {
        nishioPixel.meiroApi.tiltAsk();   // タイマーや 自動openからの 呼び出しと 同じ。APIへは 到達させない。
        return { calls: window.__asks, asked: nishioPixel.meiroApi.tilt().asked, legacy: navigator.userActivation === undefined };
      });
      await page.click('#meiro [data-mz="slow"]');
      await page.waitForTimeout(300);
      const first = await page.evaluate(() => ({ calls: window.__asks, asked: nishioPixel.meiroApi.tilt().asked }));
      await page.click('#meiro [data-mz="slow"]');
      await page.waitForTimeout(300);
      await page.click('#meiro [data-mz="slow"]');
      const last = await page.evaluate(() => ({ calls: window.__asks, asked: nishioPixel.meiroApi.tilt().asked }));
      await page.waitForFunction(() => NISHIO_MEIRO.game && NISHIO_MEIRO.game.board && !(NISHIO_MEIRO.game.cd > 0));   // 盤の めいろは 数えずに すぐ 始まる（meiro.js の はじめの 説明「3・2・1 なし」）。盤が できたら 動かせる
      let moved = 0;
      for (const key of ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp']) {
        const at = await page.evaluate(() => [NISHIO_MEIRO.game.x, NISHIO_MEIRO.game.y]);
        await page.keyboard.down(key); await page.waitForTimeout(500); await page.keyboard.up(key);
        moved = await page.evaluate(a => Math.hypot(NISHIO_MEIRO.game.x - a[0], NISHIO_MEIRO.game.y - a[1]), at);
        if (moved > 0.1) break;
      }
      checks['share-' + link + '-' + outcome] = { automatic, first, last, moved, ok: automatic.calls === 0 && !automatic.asked && automatic.legacy && first.calls === 1 && first.asked === (outcome !== 'notallowed') && last.calls === (outcome === 'notallowed' ? 2 : 1) && last.asked && moved > 0.1 };
      fs.writeFileSync(path.join(out, 'start-progress.json'), JSON.stringify(checks, null, 2));
    } finally { await ctx.close(); }
  }
  if (shareOnly) return { ...checks, errors, ok: !errors.length && Object.values(checks).every(c => c.ok) };
  const { ctx, page } = await fresh();
  try {
    checks.sensor = await page.evaluate(() => {
      const api = nishioPixel.meiroApi, tg = api.tilt(), samples = [];
      let time = 1000;
      const send = (gamma, beta = 40, ms = 16) => {
        const e = new DeviceOrientationEvent('deviceorientation', { gamma, beta });
        Object.defineProperty(e, 'timeStamp', { value: time += ms }); window.dispatchEvent(e);
      };
      // 傾きの 感度は 上がった（pixel.js の tiltCurve。運営者の声 2026-10-31「転がりの感度を上げる」「傾き感度上げる」）：いちばん 強く なる 角度は 12度（ふつう）、
      // 中心の 無力は 角度の 3%（12度なら 0.36度）まで、小さい 傾き（25% まで）で 力 0.65、そこから 1 まで まっすぐ。5度の 力は 下の 式（0.728）。
      // 前は 5度で 0.44〜0.45、0.7度の 手ぶれは 力 0 だった
      const deg = tg.deg, v5 = Math.min(1, 5 / deg), want = v5 < 0.25 ? (v5 - 0.03) / 0.22 * 0.65 : 0.65 + (v5 - 0.25) / 0.75 * 0.35, dead = deg * 0.03;
      for (const hz of [30, 60, 100]) {
        api.tiltReset(); send(0); send(0);
        let first = null;
        for (let i = 1; i <= Math.ceil(hz * 0.2); i++) { send(5, 40, 1000 / hz); if (first === null && tg.x > 0.4) first = i * 1000 / hz; }
        samples.push({ hz, first, force: tg.x, want });
        send(dead * 0.8); if (tg.x !== 0) return { ok: false, why: 'center drift', samples };   // 無力の 中（中心の 手ぶれ）：力は 0 に もどる
        send(dead * 2); const out = tg.x; send(0);   // 無力の すぐ 外：小さな 力が 出る（びんかん）
        if (!(out > 0 && out < 0.15) || tg.x !== 0) return { ok: false, why: 'dead zone edge', out, samples };
      }
      const rotations = [];
      for (const angle of [90, 180, 270, 0, -90]) {
        Object.defineProperty(screen.orientation, 'angle', { configurable: true, value: angle });
        send(0, 0); send(0, 0);
        const neutral = tg.x === 0 && tg.y === 0;
        const pair = angle === 90 ? [0, 5] : angle === 270 || angle === -90 ? [0, -5] : angle === 180 ? [-5, 0] : [5, 0];
        for (let i = 0; i < 10; i++) send(...pair);
        rotations.push({ angle, neutral, right: tg.x > 0.4, y: tg.y });
      }
      window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
      const reset = !tg.base && tg.x === 0 && tg.y === 0;
      const e = new Event('deviceorientation'); Object.defineProperties(e, { gamma: { value: NaN }, beta: { value: null } }); window.dispatchEvent(e);
      const invalid = !tg.base;
      Object.defineProperty(screen.orientation, 'angle', { configurable: true, value: 0 });
      api.tiltReset(); send(0, 179); send(0, -179); send(0, -180);
      const seam = tg.x === 0 && tg.y === 0;
      window.dispatchEvent(new Event('blur'));
      const blur = !tg.base && tg.x === 0 && tg.y === 0;
      return { seam, blur, samples, rotations, reset, invalid, deg, ok: deg === 12 && samples.every(s => s.first !== null && s.first <= 67 && Math.abs(s.force - s.want) < 0.01 && s.force <= s.want + 1e-9) && rotations.every(r => r.neutral && r.right && r.y === 0) && reset && invalid && seam && blur };
    });
    checks.motion = await movementWithClear(page, true);
    const { ctx: helpCtx, page: hp } = await fresh();
    try {
    // ヘルプは 自分で 開き、とじたら 中心を 合わせなおす。読み中は 動かない。
    await hp.evaluate(() => document.getElementById('howtoOpen').click());
    const start = await hp.evaluate(() => ({ x: nishioPixel.roll.x, y: nishioPixel.roll.y }));
    await hp.keyboard.down('ArrowRight'); await hp.waitForTimeout(300); await hp.keyboard.up('ArrowRight');
    const frozen = await hp.evaluate(a => Math.hypot(nishioPixel.roll.x - a.x, nishioPixel.roll.y - a.y) < 0.01, start);
    await hp.click('#howtoOk');
    const closed = await hp.evaluate(() => document.getElementById('howto').hidden && !nishioPixel.meiroApi.tilt().base);
    checks.help = { frozen, closed, ok: frozen && closed };
    await hp.setViewportSize({ width: 667, height: 375 }); await shot(hp, 'landscape');
    const fit = await hp.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
    await hp.setViewportSize({ width: 390, height: 780 }); await shot(hp, 'portrait');
    checks.layout = { fit, ok: fit };
    } finally { await helpCtx.close(); }
  } finally { await ctx.close(); }
  return { ...checks, errors, ok: !errors.length && Object.values(checks).every(c => c.ok) };
}
// 遊びの 途中の ごほうび・本の 窓を 閉じてから 測る（窓が 出た 回は 理由を 残して 取りなおす）。
async function clearOverlays(page) {
  for (let i = 0; i < 20; i++) {
    const clear = await page.evaluate(() => {
      document.querySelectorAll('.medashi:not([hidden]) .md-close, #pxInfo:not([hidden]) [data-close], [data-pick-dot]').forEach(b => b.click());
      const r = document.getElementById('reward'); if (r.classList.contains('show')) r.click();
      if (window.NISHIO_MOVIE && NISHIO_MOVIE.playing) NISHIO_MOVIE.close();
      return !nishioPixel.mapCovered(true) && !nishioPixel.sightBusy();
    });
    if (clear) return;
    await page.waitForTimeout(150);
  }
  throw new Error('measurement blocked by overlay');
}
async function movementWithClear(page, sensor) {
  const attempts = [];
  for (let i = 0; i < 3; i++) {
    await clearOverlays(page);
    const r = await checkMovement(page, sensor); attempts.push(r);
    if (!r.covered) return { ...r, attempts };
  }
  return { attempts, ok: false };
}
// 実際の rollStep を 動かす。水平な 道で 動き出し・止まり・手ぶれを 測る。
async function checkMovement(page, sensor) {
  await page.waitForFunction(() => nishioPixel.roll.x !== null && !nishioPixel.mapCovered(true));
  return page.evaluate(async sensor => {
    const P = nishioPixel, G = nishioGo, A = P.meiroApi, wait = ms => new Promise(r => setTimeout(r, ms));
    G.state.welcomed = true; G.setGuide(null); nishioKomeTalk.setOn(false); P.setHeightFn(() => 0);
    const near = P.maze.near(P.roll.x, P.roll.y), at = near ? { x: near.x, y: near.y } : P.roll;
    const send = gamma => window.dispatchEvent(new DeviceOrientationEvent('deviceorientation', { gamma, beta: 40 }));
    const pos = () => ({ x: P.roll.x, y: P.roll.y });
    P.rollPut(at.x, at.y); A.tiltReset();
    const p0 = pos(); let small = null, stopped = null, noise = null, touch = null;
    if (sensor) {
      send(0); send(0);
      for (let i = 0; i < 30; i++) { send(5); await wait(33); }
      small = Math.hypot(P.roll.x - p0.x, P.roll.y - p0.y);
      send(0);
      for (let i = 0; i < 100 && P.roll.v > 0.02; i++) await wait(50);
      stopped = P.roll.v < 0.05 && A.tilt().x === 0;
      const p1 = pos();
      for (let i = 0; i < 20; i++) { send(i % 2 ? 0.7 : -0.7); await wait(33); }
      noise = Math.hypot(P.roll.x - p1.x, P.roll.y - p1.y);
    } else {
      document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      await wait(500);
      document.body.dispatchEvent(new KeyboardEvent('keyup', { key: 'ArrowRight', bubbles: true }));
      small = Math.hypot(P.roll.x - p0.x, P.roll.y - p0.y);
      P.rollPut(at.x, at.y); A.tiltReset();
      await wait(250);   // 位置を 戻した あとの カメラと 当たりの 絵を そろえる
      const cv = document.getElementById('pxCanvas');
      const busy = (x, y) => G.npcs.some(n => { const q = P.npcTile(n); return Math.abs(q.x - x) < 2 && Math.abs(q.y - y) < 2; }) || G.spots.some(s => { const q = P.toTile(s.lat, s.lng); return Math.hypot(q.x - x, q.y - y) < 3; });
      let to = null;
      for (const [dx, dy] of [[3, 0], [-3, 0], [0, 3], [0, -3], [4, 0], [-4, 0]]) {
        const x = Math.floor(at.x) + dx, y = Math.floor(at.y) + dy;
        if (busy(x, y)) continue;
        let blocked = false;
        for (let i = 1; i <= Math.max(Math.abs(dx), Math.abs(dy)); i++) {
          const x0 = at.x + Math.sign(dx) * (i - 1), y0 = at.y + Math.sign(dy) * (i - 1);
          if (P.rollBlockedFrom(x0, y0, x0 + Math.sign(dx), y0 + Math.sign(dy))) blocked = true;
        }
        const p = P.tileToClient(x, y);
        if (!blocked && document.elementFromPoint(p.x, p.y) === cv && p.x > 40 && p.x < innerWidth - 65) { to = p; break; }
      }
      if (to) cv.dispatchEvent(new MouseEvent('click', { clientX: to.x, clientY: to.y, bubbles: true }));
      for (let i = 0; i < 30 && Math.hypot(P.roll.x - at.x, P.roll.y - at.y) < 0.3; i++) await wait(100);
      touch = Math.hypot(P.roll.x - at.x, P.roll.y - at.y);
    }
    const covered = P.mapCovered(true);
    P.setHeightFn(null); A.tiltReset();
    return { small, stopped, noise, touch, covered, blockers: [...document.querySelectorAll('#pxInfo:not([hidden]), [role=dialog]:not([hidden]), .reward.show')].map(e => e.id), ok: !covered && small > 0.15 && (sensor ? stopped && noise < 0.05 : touch > 0.3) };
  }, sensor);
}
module.exports = { runStartChecks };
if (require.main === module) (async () => {
  const out = path.resolve(process.argv[2]); fs.mkdirSync(out, { recursive: true });
  const { chromium } = require('playwright'), { startServer } = require('./bake-common');
  const port = Number(process.env.PLAYTEST_PORT) || 8901, server = startServer(port), browser = await chromium.launch({ executablePath: process.env.CHROMIUM });
  try { const r = await runStartChecks(browser, `http://127.0.0.1:${port}/nishio-go.html`, out, { shareOnly: process.argv.includes('--share') }); fs.writeFileSync(path.join(out, process.argv.includes('--share') ? 'share.json' : 'start.json'), JSON.stringify(r, null, 2)); console.log(JSON.stringify(r)); process.exitCode = r.ok ? 0 : 1; }
  finally { await browser.close(); server.close(); }
})();
