// 米作り365：通しの 確かめ（本物の PointerEvent で スワイプして、日が 進む・水位が かわる・収穫まで 通る・字が はみ出ない、を 見る）
//   node tools/kome365/check.js            # ぜんぶ
//   node tools/kome365/check.js swipe      # 名前で えらぶ（syntax swipe water year … vary fit）
// スクショは KOME_OUT（なければ OS の 一時フォルダの kome365-check）に 書く。リポジトリの 中には 書かない。
const { chromium } = require('playwright');
const path = require('path'), os = require('os'), fs = require('fs');
const FILE = 'file://' + (process.env.KOME_FILE || path.resolve(__dirname, '../../kome365.html')); // KOME_FILE で 前の 版を ためせる
const OUT = process.env.KOME_OUT || path.join(os.tmpdir(), 'kome365-check');
fs.mkdirSync(OUT, { recursive: true });
const only = process.argv.slice(2);

const { HELPERS } = require('./helpers'); // ページの 中で 使う 道具（playtest.js と 共通。8周目）

const CHECKS = {
  async syntax(){
    const src = fs.readFileSync(FILE.replace('file://',''), 'utf-8'), scripts = [...src.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
    const bad = []; scripts.forEach((sc, i) => { try { new Function(sc); } catch (e) { bad.push(i + ': ' + e.message); } });
    ok(bad.length===0, 'script の 構文', bad);
    const lb = scripts.filter(sc => /\(\?<[=!]/.test(sc)).length; ok(lb===0, '後読み (?<=) を 使わない（古い Safari で 止まる）', lb);
    ok(!/claude-|opus|sonnet|haiku/i.test(src.replace(/claude:viewport-fit-sides/g,'')), 'モデルの 名前を 書かない');
  },
  // → で 日が 進む。はじくと 何日も パラパラ。← で 止まる
  async swipe(b){
    const p = await page(b, 390, 844);
    const r = await p.evaluate(() => {
      K3.manual = true; K3.fixedSeed = 11; K3.start(); steps(5); swipe('up', 160, false, true); /* まず つける（22周目：つけずに はじくと 4日目で 止まる） */
      const d0 = K3.S.day; swipe('right', 120, false); const d1 = K3.S.day; flush(); const d1b = K3.S.day;
      swipe('right', 260, true); const q = K3.V.flipQueue; const d2 = K3.S.day; flush(); const d3 = K3.S.day;
      // はじいて パラパラの とちゅうで ← を 入れると 止まる
      swipe('right', 260, true); steps(3); const dq = K3.S.day; swipe('left', 80, false); const q2 = K3.V.flipQueue; steps(60); const d4 = K3.S.day;
      // 引いて、止めて、はなす：はじきでは ない（3周目）
      const cx = innerWidth/2, cy = innerHeight/2; ev('pointerdown', 1, cx-100, cy); for (let i=1;i<=3;i++){ ev('pointermove', 1, cx-100+i*60, cy); K3.step(1/60); } steps(40); ev('pointerup', 1, cx+80, cy); const qHold = K3.V.flipQueue; flush();
      // 速さごとの 日数（実機の はじき 1.5〜3px/ms が 4〜9日）
      const days = v => { const d0 = K3.S.day; const n = 4, len = v*n*16.7; ev('pointerdown', 1, cx-len/2, cy); K3.step(1/60); for (let i=1;i<=n;i++){ ev('pointermove', 1, cx-len/2+len*i/n, cy); K3.step(1/60); } ev('pointerup', 1, cx+len/2, cy); flush(); return K3.S.day - d0; };
      const dv = [1, 1.5, 3].map(days);
      // 途中で 切れた 指（pointercancel）は なかった ことに。id 2 の 指でも 動く（8周目）
      const dc = K3.S.day; ev('pointerdown', 3, cx-100, cy); for (let i=1;i<=6;i++){ ev('pointermove', 3, cx-100+i*30, cy); K3.step(1/60); } ev('pointercancel', 3, cx+80, cy); K3.step(1/60); const cancelDay = K3.S.day - dc;
      const d2b = K3.S.day; swipe('right', 120, false, true, 2); const id2Day = K3.S.day - d2b;
      // 引いて 戻す・親指の 弧・短い はじき（13周目）：たんぼの 場面で
      const dayBefore = K3.S.day; K3.jump('tiller'); K3.S.f.water = 2;
      const back = (() => { const d0 = K3.S.day; ev('pointerdown', 1, cx-60, cy); for (let i=1;i<=6;i++){ ev('pointermove', 1, cx-60+i*20, cy); K3.step(1/60); } for (let i=1;i<=4;i++){ ev('pointermove', 1, cx+60-i*28, cy); K3.step(1/60); } ev('pointerup', 1, cx-52, cy); flush(); return K3.S.day - d0; })();
      const w0 = K3.S.f.water; const arc = (() => { const d0 = K3.S.day; ev('pointerdown', 1, cx, cy+70); for (let i=1;i<=12;i++){ ev('pointermove', 1, cx + Math.min(10, i*2), cy+70 - i*12); K3.step(1/60); } ev('pointerup', 1, cx+10, cy-74); flush(); return { day: K3.S.day - d0, water: K3.S.f.water - w0 }; })();
      const shortFlick = (() => { const d0 = K3.S.day; ev('pointerdown', 1, cx-14, cy); K3.step(1/60); ev('pointermove', 1, cx, cy); K3.step(1/60); ev('pointermove', 1, cx+14, cy); ev('pointerup', 1, cx+14, cy); flush(); return K3.S.day - d0; })();
      return { d0, d1, d1b, q, d2, d3, dq, q2, d4, qHold, dv, cancelDay, id2Day, back, arc, shortFlick, dayEnd: K3.S.day, date: document.getElementById('date').textContent, dayNo: document.getElementById('dayNo').textContent };
    });
    ok(r.d1 === r.d0 + 1 && r.d1b === r.d1, 'ゆっくり →：1日 だけ 進む', r);
    ok(r.q >= 3 && r.d3 - r.d2 === r.q, 'はじく →：つづけて 何日も めくれる（慣性）', r);
    ok(r.q2 === 0 && r.d4 <= r.dq + 1, 'めくれて いる とちゅうの ← で 止まる', r);
    ok(r.qHold === 0, '引いて 止めてから はなすと 1日 だけ', r.qHold);
    ok(r.cancelDay === 0 && r.id2Day === 1, '途中で 切れた 指は 進めない。2本目の id の 指でも 進む（8周目）', [r.cancelDay, r.id2Day]);
    ok(r.back === 0 && r.arc.day === 0 && r.arc.water > 0 && r.shortFlick <= 1, '引いて 戻すと 何も しない。親指の 弧は ↑。短い はじきは 1日 まで（13周目）', [r.back, r.arc, r.shortFlick]);
    ok(r.dv[0] <= 2 && r.dv[1] >= 2 && r.dv[1] <= 3 && r.dv[2] >= 7 && r.dv[2] <= 10, 'はじきの 速さと 日数：1px/ms ≤2日・1.5 で 2〜3日・3 で 7〜10日（21周目）', r.dv);
    ok(/日$/.test(r.date) && r.dayNo === r.dayEnd + '日目', 'HUD の 日づけが 進む', r);
    await p.screenshot({ path: path.join(OUT, 'swipe.png') });
  },
  // ↑ で 水が 入り、↓ で 落ちる。スワイプの 長さで 量が かわる。水面は ばねで ついてくる
  async water(b){
    const p = await page(b, 390, 844);
    const r = await p.evaluate(() => {
      K3.manual = true; K3.fixedSeed = 11; K3.jump('tiller'); const f = K3.S.f; f.dat = 35; f.water = 2; K3.V.water = 2; K3.V.waterV = 0; steps(60); /* 分げつの ころ（10〜30日）は ゆっくりの ↑が 4cm までなので、その あとで */
      const w0 = f.water; swipe('up', 80, true); const w1 = f.water; swipe('up', 240, true); const w2 = f.water; /* はじく（ゆっくりは 5cm まで。21周目） */
      const v0 = K3.V.water; steps(90); const v1 = K3.V.water;   // 見た目の 水面が 本当の 水に 追いつく
      swipe('down', 120, false); const w3 = f.water; swipe('down', 400, true); const w4 = f.water; steps(90); const v2 = K3.V.water;
      const stat = document.getElementById('stat').textContent;
      return { w0, w1, w2, v0, v1, w3, w4, v2, stat };
    });
    ok(r.w1 > r.w0 && r.w2 > r.w1, '↑ で 水が 入る。長い ほど 多い', r);
    ok(r.w2 - r.w1 > r.w1 - r.w0, 'スワイプの 長さで 量が かわる', r);
    ok(Math.abs(r.v1 - r.w2) < 0.3 && r.v0 <= r.w2 + 0.3, '水面は 指に ついてきて、はなしたら 本当の 水に 落ちつく（ばね）', r);
    ok(r.w3 < r.w2 && r.w4 === 0 && Math.abs(r.v2) < 0.3, '↓ で 落ちる。強く はじくと 空に', r);
    ok(/みず 0cm/.test(r.stat), 'HUD の 水が 0cm に なる', r.stat);
    await p.screenshot({ path: path.join(OUT, 'water.png') });
  },
  // 1年を 本物の スワイプ だけで 通す（種→苗→田うえ→水→中干し→追肥→穂肥→出穂→刈る→乾燥→検査）
  async year(b){
    const p = await page(b, 390, 844);
    const r = await p.evaluate(() => {
      K3.manual = true; K3.fixedSeed = 3; K3.start(); steps(5); const S = K3.S, f = S.f, log = [];
      const tick = () => { swipe('right', 100, false); flush(); };
      swipe('up', 160, false); log.push(['soak', S.seed_.soaked]);
      for (let i=0;i<40 && !S.seed_.sprouted;i++) tick(); log.push(['sprout', S.seed_.sprouted, S.day]);
      swipe('down', 160, false); log.push(['sown', S.phase, S.nur.sown]);
      for (let i=0;i<60 && S.nur.age < 30;i++){ if (S.nur.moist < 0.4) swipe('up', 160, false); tick(); } log.push(['nursery', S.nur.age, S.nur.stress]);
      for (let i=0;i<6 && S.phase!=='field';i++) swipe('left', 120, false); log.push(['tofield', S.phase]);
      swipe('up', 100, false); const shiroNeeded = K3.actions().left; for (let i=0;i<3 && f.shiro < 2;i++) swipe('left', 120, false); const shiro = f.shiro; const early = K3.actions().left; for (let i=0;i<3;i++) tick();
      for (let i=0;i<8 && !f.planted;i++) swipe('left', 120, false); log.push(['planted', f.planted, S.day, shiroNeeded, shiro, early]);
      let fert = 0, hoFert = 0, cuts = 0;
      for (let i=0;i<260 && !S.hv.done;i++){
        const a = K3.actions();
        if (a.left==='追肥'){ swipe('left', 120, false); fert++; }
        if (a.left==='穂肥'){ swipe('left', 120, false); hoFert++; }
        if (a.left==='刈る' && f.gdd >= 980){ swipe('left', 160, true); cuts++; continue; }
        // 水：はじめ 深め → 分げつ 浅く → 中干し（dat 34〜44）→ 水を もどす → 出穂の あとは 切らさない。暑い 日は 入れかえる
        if (f.dat < 10){ if (f.water < 4) swipe('up', 140, false); }
        else if (f.dat < 34){ if (f.water < 1.5) swipe('up', 60, false); else if (f.water > 4) swipe('down', 60, false); }
        else if (f.dat <= 44){ if (f.water > 0) swipe('down', 400, true); if (K3.actions().left==='溝切り') swipe('left', 120, false); }
        else { if (f.water < 2) swipe('up', 120, false); else if (f.heading && S.weather[S.day].w==='高温') swipe('up', 60, false); }
        tick();
      }
      log.push(['harvest', S.hv.done, S.day, Math.round(f.gdd), cuts, fert, hoFert, f.hoshiDays, f.mizo]);
      for (let i=0;i<8 && S.hv.moisture > 15.5;i++) tick(); log.push(['dry', S.hv.moisture]);
      swipe('left', 120, false);
      const res = S.result;
      return { log, over: S.over, phase: S.phase, result: res && { grade: res.grade, yield: Math.round(res.yieldKg), seiryu: Math.round(res.seiryu), taste: res.taste }, shown: !document.getElementById('result').hidden, rank: document.getElementById('rank').textContent, day: S.day, swipes: S.swipes, T: Math.round(f.T), H: Math.round(f.H) };
    });
    const L = Object.fromEntries(r.log);
    ok(L.soak === true, '↑ で 種を 水に つける', L);
    ok(L.sprout === true, '→ を くり返すと 芽が 出る', L);
    ok(r.log[2][1] === 'nursery', '↓ で まく → 苗の 場面', r.log[2]);
    ok(r.log[4][1] === 'field' && r.log[5][1] === true, '← で たんぼへ → ↑ 水 → ← 2回 代かき → 3日 → ← 4回で 田うえ', r.log.slice(3,6));
    ok(r.log[5][3] === '代かき' && r.log[5][4] === 2 && r.log[5][5] === '田うえ', '代かきは 水が ある 時に 2回。その あと 田うえ（5周目）', r.log[5]);
    ok(r.log[6][1] === true && r.log[6][3] >= 950 && r.log[6][4] >= 5, '出穂後 1000℃ ちかくで ← 5回 刈る', r.log[6]);
    ok(r.log[6][5] === 1 && r.log[6][6] === 1 && r.log[6][7] >= 5 && r.log[6][8] === true, '追肥・穂肥・中干し・溝切りが できた', r.log[6]);
    ok(L.dry <= 15.5 && L.dry >= 14, '乾燥 15% で とまる', L.dry);
    ok(r.over && r.shown && r.result && ['一等','二等','三等','規格外'].includes(r.result.grade), '← で 検査 → 結果が 出る', r.result);
    ok(r.result && r.result.yield >= 300 && r.result.yield <= 700, '収量が それらしい（300〜700 kg/10a）', r.result);
    ok(r.result && ['一等','二等'].includes(r.result.grade), 'ていねいに 管理すると 一等か 二等', r.result);
    ok(r.day >= 140 && r.day <= 200, '検査は 8〜10月（140〜200日目）', r.day);
    console.log('    （' + r.day + '日目・スワイプ ' + r.swipes + '回・' + JSON.stringify(r.result) + '）');
    await p.waitForTimeout(500); await p.screenshot({ path: path.join(OUT, 'year-result.png') });
  },
  // 乾燥：はじいても 15% で めくりが 止まる。もう一度 → すると 乾かしすぎ。← 見る で 1株の 札が 出る
  async dry(b){
    const p = await page(b, 390, 844);
    const r = await p.evaluate(() => {
      K3.manual = true; K3.fixedSeed = 11; K3.jump('heading'); swipe('left', 120, false); const card = !!K3.V.card; steps(20); const cardOn = !!K3.V.card; steps(200); const cardOff = !K3.V.card;
      K3.jump('harvest'); for (let i=0;i<8 && !K3.S.hv.done;i++) K3.doLeft(); const m0 = K3.S.hv.moisture;
      swipe('right', 260, true); flush(); const m1 = K3.S.hv.moisture, q = K3.V.flipQueue; const stat = document.getElementById('stat').textContent;
      swipe('right', 100, false); flush(); const m2 = K3.S.hv.moisture;
      return { card, cardOn, cardOff, m0, m1, q, stat, m2, left: K3.actions().left, wx: document.getElementById('wx').textContent };
    });
    ok(r.card && r.cardOn && r.cardOff, '← 見る で 1株の 札が 出て、消える', r);
    ok(r.m0 === 25 && r.m1 <= 15.5 && r.m1 >= 14 && r.q === 0, 'はじいても 15% で 止まる（乾燥機の 仕上がり）', r);
    ok(r.m2 < r.m1 && r.m2 >= 13 && r.left === 'けんさ', 'もう一度 → すると 少し 乾かしすぎ（1日 0.8%。それでも 検査へ 行ける）', r);
    ok(/あす/.test(r.wx), 'HUD に あすの 天気', r.wx);
    const c = await p.evaluate(() => { K3.jump('harvest'); for (let i=0;i<8 && !K3.S.hv.done;i++) K3.doLeft(); K3.V.toast = null; for (let i=0;i<3;i++) K3.advanceDay(); return { m: K3.S.hv.moisture, toast: K3.V.toast && K3.V.toast.text }; });
    ok(c.m <= 15.5 && c.toast === '15%', '1日ずつ 進めても 15% を こえた 時に 合図（8周目）', c);
    const k = await p.evaluate(() => { K3.jump('tiller'); const f = K3.S.f; f.dat = 35; f.hoshiDays = 8; f.water = 2; const w0 = f.water; /* 中干しの あと（窓の 外。21周目：窓の 中は ↓が 0 まで） */ window.dispatchEvent(new KeyboardEvent('keydown', { key:'ArrowUp' })); const w1 = f.water, t1 = document.getElementById('say').textContent; window.dispatchEvent(new KeyboardEvent('keydown', { key:'ArrowDown' })); const w2 = f.water; return { w0, w1, w2, t1 }; });
    ok(k.w1 === k.w0 + 3 && k.w2 === Math.max(2.5, k.w1 - 3) && /→で あした/.test(k.t1), '矢印キーも 指と 同じ 道（水 +3cm・−3cm は 2.5cm のこす・こめつぶの 返事）', k);
    await p.screenshot({ path: path.join(OUT, 'dry.png') });
  },
  // 中干しの 合図が 出る。水が ない 間は 追肥できない（3周目）
  async cue(b){
    const p = await page(b, 390, 844);
    const r = await p.evaluate(() => {
      K3.manual = true; K3.fixedSeed = 11; K3.jump('tiller'); const f = K3.S.f; let cue = null; for (let i=0;i<30 && !cue;i++){ f.water = Math.max(f.water, 2); K3.advanceDay(); if (/中干し/.test(document.getElementById('say').textContent)) cue = f.dat; }
      f.water = 0.5; f.dat = 42; f.mizo = true; const dryLeft = K3.actions().left; f.water = 3; const wetLeft = K3.actions().left;
      return { cue, T: Math.round(f.T), dryLeft, wetLeft };
    });
    ok(r.cue != null && r.cue <= 40, '中干しの 合図が 40日目 までに 出る', r);
    ok(r.dryLeft !== '追肥' && r.wetLeft === '追肥', '追肥は 水が ある 時だけ', r);
  },
  // お客さん目線：吹き出しの 矢印 だけを 見て 遊ぶ（矢印が なければ →）。ルールを 読まなくても 収穫まで 行ける（4周目）
  async customer(b){
    const p = await page(b, 390, 844);
    const r = await p.evaluate(() => {
      K3.manual = true; K3.fixedSeed = 3; K3.start(); const S = K3.S; const seen = new Set();
      for (let i=0;i<700 && !S.over;i++){ const t = document.getElementById('say').textContent; seen.add(t.slice(0, 12));
        const dir = /↑/.test(t) ? 'up' : /↓/.test(t) ? 'down' : /←/.test(t) ? 'left' : 'right'; swipe(dir, dir==='right' ? 110 : 160, false); flush(); }
      return { over: S.over, day: S.day, done: S.hv.done, grade: S.result && S.result.grade, yield: S.result && Math.round(S.result.yieldKg), swipes: S.swipes, hoshi: S.f.hoshiDays, A1: S.f.A1, A2: S.f.A2, lines: seen.size };
    });
    ok(r.over && r.done && r.day <= 200, '吹き出しの 矢印 だけで 収穫・検査まで 行ける', r);
    ok(r.hoshi >= 5 && r.A1 > 0 && r.A2 > 0, 'その 途中で 中干し・追肥・穂肥も 言われて できる', r);
    ok(r.grade && r.grade !== '規格外' && r.swipes <= 400, '言われた とおりで 三等 以上・スワイプ 400回 いない', r);
  },
  // 溝切り：中干しの 間の 雨が 落ちる（5周目）
  async mizo(b){
    const p = await page(b, 390, 844);
    const r = await p.evaluate(() => {
      K3.manual = true; K3.fixedSeed = 11; const run = mizo => { K3.jump('tiller'); const S = K3.S, f = S.f; for (let i=0;i<40 && f.dat < 36;i++){ f.water = 2; K3.advanceDay(); } f.water = 0; if (mizo) K3.doLeft(); let rainDays = 0, wet = 0; for (let i=0;i<8;i++){ const wx = S.weather[S.day]; K3.advanceDay(); if (wx.w==='雨'||wx.w==='台風') rainDays++; if (f.water >= 1) wet++; } return { mizo: f.mizo, rainDays, wet, dryRun: f.dryRun }; };
      return { a: run(false), b: run(true) };
    });
    ok(r.b.mizo && !r.a.mizo, '中干しの 間に ← で 溝切り', r);
    ok(r.b.wet <= r.a.wet && r.b.dryRun >= r.a.dryRun, '溝が あると 雨の 日でも 乾いた まま（同じ 天気で くらべる）', r);
  },
  // はじき続けて 水が 0 に なっても 詰まない：めくりが 止まり、吹き出しは「→」か「↑」を 言う。結果には 出来ばえと じこベスト（10周目）
  async stuck(b){
    const p = await page(b, 390, 844);
    const r = await p.evaluate(() => {
      K3.manual = true; K3.fixedSeed = 11; K3.jump('tiller'); const S = K3.S, f = S.f; f.water = 2.2; let stopped = null; const hud0 = document.getElementById('stage').textContent;
      for (let i=0;i<6 && stopped == null;i++){ swipe('right', 260, true); const d0 = S.day; flush(); if (f.water < 1) stopped = { day: S.day, dayGap: S.day - d0 }; }
      const t = document.getElementById('say').textContent; const okText = /→|↑/.test(t);
      let moved = 0; for (let i=0;i<5;i++){ const t2 = document.getElementById('say').textContent; const dir = /↑/.test(t2) ? 'up' : /↓/.test(t2) ? 'down' : /←/.test(t2) ? 'left' : 'right'; const d0 = S.day; swipe(dir, 120, false, true); if (S.day > d0) moved++; }
      return { water: f.water, stopped, text: t.slice(0, 30), okText, moved, hud: hud0, hud2: document.getElementById('stage').textContent };
    });
    ok(r.stopped && r.okText, '水が 0 に なった 日に パラパラが 止まり、吹き出しは → か ↑ を 言う', r);
    ok(r.moved >= 3, 'その あとも 吹き出しの とおりで 日が すすむ（詰まない）', r);
    ok(/茎\d+本/.test(r.hud) && /℃|茎|出穂/.test(r.hud2), 'HUD に 茎の 本数（出穂の あとは 積算℃）', [r.hud, r.hud2]);
    const wp = await p.evaluate(() => { K3.jump('tiller'); K3.V.particles = []; K3.advanceDay(); const n = K3.V.particles.length; const w = K3.S.weather[K3.S.day].w; K3.jump('nursery'); return { n, w, stat: document.getElementById('stat').textContent }; });
    ok(wp.n >= 4, 'めくった 日に 天気の 粒が 飛ぶ（13周目）', wp);
    ok(/葉/.test(wp.stat), 'なえの HUD に 葉齢', wp.stat);
    const z = await p.evaluate(() => { localStorage.removeItem('k365_log'); localStorage.removeItem('k365_years'); K3.jump('result'); const s1 = document.getElementById('rScore').textContent; K3.jump('result'); const s2 = document.getElementById('rScore').textContent; const log = JSON.parse(localStorage.getItem('k365_log')); return { s1, s2, n: log.length, score: log[0].score }; });
    ok(/出来ばえ \d+点/.test(z.s1) && !/じこベスト/.test(z.s1) && /じこベスト/.test(z.s2) && z.n === 2 && z.score > 0, '結果に 出来ばえの 点。2年目から じこベスト', z);
    const y = await p.evaluate(() => { localStorage.setItem('k365_years', '60'); localStorage.setItem('k365_log', JSON.stringify(Array.from({ length: 50 }, () => ({ score: 1 })))); K3.jump('result'); return { t: document.getElementById('rScore').textContent, n: JSON.parse(localStorage.getItem('k365_log')).length }; });
    ok(/61年目/.test(y.t) && y.n === 50, '記録は 50年 まで でも 年目は すすむ（12周目）', y);
  },
  // 年で ちがう：台風の ない 年・葉いろ 37〜42、出穂後の 一言は 日ごとに かわる、出穂後の ゆっくりの ↑は 5cm まで（19周目）
  async vary(b){
    const p = await page(b, 390, 844);
    const r = await p.evaluate(() => {
      const ty = {}, n0 = new Set(); for (const sd of [1, 2, 3, 5, 7, 8, 11, 42]){ K3.manual = true; K3.fixedSeed = sd; K3.start(); ty[sd] = K3.S.weather.some(w => w && w.w==='台風'); n0.add(K3.S.N0); }
      K3.fixedSeed = 11; K3.jump('heading'); const S = K3.S, f = S.f; const says = new Set(); for (let i=0;i<12;i++){ f.water = Math.max(f.water, 2); K3.advanceDay(); says.add(document.getElementById('say').textContent); }
      f.water = 2; K3.V.water = 2; K3.V.waterV = 0; swipe('up', 160, false); const slow = f.water; f.water = 2; K3.V.water = 2; swipe('up', 400, true); const fast = f.water;
      return { ty, n0: [...n0], says: says.size, slow, fast };
    });
    const tv = Object.values(r.ty); ok(tv.some(x => x) && tv.some(x => !x), '台風の 年と ない 年が ある', r.ty);
    ok(r.n0.length >= 3 && r.n0.every(n => n >= 37 && n <= 42), '田うえ時の 葉いろは 年で 37〜42', r.n0);
    ok(r.says >= 8, '出穂後の 一言は 日ごとに かわる（12日で 8通り 以上）', r.says);
    ok(r.slow <= 5 && r.fast > 5, '出穂後の ゆっくりの ↑は 5cm まで。はじけば 深く', [r.slow, r.fast]);
  },
  // 手ごたえ（20周目）：ふつうの 速さの 長い 引きは 1日、ゆっくりの ↑は 上限で ゴム、よい 深さ 3回で ◎、済は 暦の 下に ならび 結果に 済 N/6、たねの ←の あとも 吹き出しが 更新
  async feel(b){
    const p = await page(b, 390, 844);
    const r = await p.evaluate(() => {
      K3.manual = true; K3.fixedSeed = 11; K3.jump('tiller'); const S = K3.S, f = S.f; f.dat = 35; f.water = 3; K3.V.water = 3; K3.V.waterV = 0;
      const d0 = S.day; swipe('right', 220, false, true); const slowLong = S.day - d0; /* 0.4px/ms・220px → 1日 */
      const d1 = S.day; const x = 150, y0 = 600; ev('pointerdown', 1, x, y0); for (let i=1;i<=6;i++){ ev('pointermove', 1, x + i*40, y0); steps(3); } ev('pointerup', 1, x + 240, y0); flush(); const midLong = S.day - d1; /* 0.8px/ms（40px/50ms）・240px → 1日 */
      f.dat = 20; f.water = 2; K3.V.water = 2; K3.V.waterV = 0; ev('pointerdown', 1, 190, 600); for (let i=1;i<=24;i++){ ev('pointermove', 1, 190, 600 - i*10); steps(1); } const dragWater = K3.V.water; ev('pointerup', 1, 190, 360); steps(3); const slowUp = f.water; /* 指の 水面は 4cm 強で 止まり、はなすと 4cm */
      f.dat = 20; let joy = 0, marks = 0; for (let i=0;i<6;i++){ f.water = 1; K3.V.water = 1; K3.V.waterV = 0; swipe('up', 60, false, true); if (/いい 深さ/.test(document.getElementById('say').textContent)) joy++; } marks = K3.V.stamps.filter(st => st.text==='◎').length; /* 6回 続けても ◎は 区間で 1回（21周目） */
      K3.jump('nakaboshi'); K3.S.f.water = 0; K3.doLeft(); for (let i=0;i<150;i++) K3.step(1/60); const done = K3.S.done.slice(); /* 溝切りの 済が 消えて カードへ（22周目。jump は S を 作りなおす） */ K3.jump('result'); const score = document.getElementById('rCard').querySelectorAll('span').length + '/' + document.getElementById('rCard').querySelectorAll('span.on').length;
      K3.start(); const S2 = K3.S; swipe('up', 160, false, true); for (let i=0;i<14 && !S2.seed_.sprouted;i++) swipe('right', 110, false, true); swipe('left', 120, false, true); const t1 = document.getElementById('say').textContent; swipe('right', 110, false, true); const t2 = document.getElementById('say').textContent;
      return { slowLong, midLong, dragWater, slowUp, joy, marks, done, score, t1, t2 };
    });
    ok(r.slowLong === 1 && r.midLong === 1, 'ふつうの 速さの 長い 引きは 1日', [r.slowLong, r.midLong]);
    ok(r.dragWater > 4 && r.dragWater < 6 && r.slowUp === 4, '分げつの ころの ゆっくりの ↑は 指でも 4cm で ゴム、はなすと 4cm', [r.dragWater, r.slowUp]);
    ok(r.joy === 6 && r.marks === 1, 'よい 深さ 3回で「いい 深さ」と ◎（6回でも 区間で 1つ）', [r.joy, r.marks]);
    ok(r.done.length >= 1 && /^6\/\d$/.test(r.score), '消えた 済が スタンプカードに、結果にも 6つの 枠', [r.done, r.score]);
    ok(/↓で まきましょう/.test(r.t2) && r.t1 !== r.t2, 'たねの ←の あとも →で 吹き出しが 更新', [r.t1, r.t2]);
  },
  // 「〜して いれば +Xkg」：中干しも 掛け流しも しない 年の 結果に、損失の 大きい 順に 2つ（11周目）
  async whatif(b){
    const p = await page(b, 390, 844);
    const r = await p.evaluate(() => { K3.manual = true; K3.fixedSeed = 11; K3.jump('heading'); const S = K3.S, f = S.f; f.hoshiDays = 0; f.root = 40; f.flowDays = 0; f.heatHits = 6; for (let i=0;i<200 && f.gdd < 1000;i++){ f.water = Math.max(f.water, 2); K3.advanceDay(); } for (let i=0;i<8 && !S.hv.done;i++) K3.doLeft(); const w = K3.whatIf(); for (let i=0;i<10 && S.hv.moisture > 15.5;i++) K3.advanceDay(); K3.doLeft(); return { w: w.map(x => [x.name, x.dy, x.ds]), text: document.getElementById('rSay2').textContent }; });
    ok(r.w.length >= 2 && (r.w[0][1] + r.w[0][2]*4) >= 15 && r.w.every((x, i) => i === 0 || x[1] + x[2]*4 <= r.w[i-1][1] + r.w[i-1][2]*4), '「〜して いれば」が 損失の 大きい 順', r.w);
    ok(/して いれば|入れかえて いれば/.test(r.text) && /\+\d+/.test(r.text), '結果の 2行目に 2つの「〜して いれば +X」', r.text);
    const g = await p.evaluate(() => { K3.jump('result'); return { w: K3.whatIf().map(x => x.name), text: document.getElementById('rSay2').textContent }; });
    ok(!/刈りどき|乾燥/.test(g.w.join()), 'ていねいな 年には 刈りどき・乾燥の「していれば」は 出ない', g);
  },
  // 出穂の 翌日に「出穂！」、台風の 翌日に たおれたか、長い 吹き出しは 注を 落とす、音ボタンは 3段（14周目）
  async heading(b){
    const p = await page(b, 390, 844);
    const r = await p.evaluate(() => { K3.manual = true; K3.fixedSeed = 11; K3.jump('tiller'); const S = K3.S, f = S.f; let said = null; for (let i=0;i<120 && !said;i++){ f.water = Math.max(f.water, 2); K3.advanceDay(); if (/出穂！/.test(document.getElementById('say').textContent)) said = { day: S.day, heading: f.heading, hud: document.getElementById('stage').textContent }; }
      for (let i=0;i<10;i++){ f.water = Math.max(f.water, 2); K3.advanceDay(); } f.lodge = 0.3; f.typhoonDay = S.day; f.water = 3; K3.advanceDay(); const ty = document.getElementById('say').textContent;
      K3.say('ながい ことばを ためす ための 吹き出しです。これは 三行に なります。<span class="src">（出典）</span>'); const longSrc = !!document.getElementById('say').querySelector('.src'); K3.say('みじかい。<span class="src">（出典）</span>', 'wow'); const shortSrc = !!document.getElementById('say').querySelector('.src');
      return { said, ty, longSrc, shortSrc }; });
    ok(!r.longSrc && r.shortSrc, '34字を こえる 吹き出しは 注を 落とし、短ければ のこす', [r.longSrc, r.shortSrc]);
    ok(r.said && r.said.day === r.said.heading + 1 && r.said.hud === '出穂', '出穂の 翌日に「出穂！」、HUD も 出穂', r.said);
    ok(/たおれました/.test(r.ty), '台風の 翌日に たおれたかを 言う', r.ty);
    const t = await p.evaluate(() => { K3.jump('tiller'); const f = K3.S.f; f.A2 = 0; f.N = 30; f.dat = f.headDat - 20; f.water = 3; K3.advanceDay(); const s1 = document.getElementById('say'); const hasSrc = !!s1.querySelector('.src'), len = s1.textContent.length; const btn = document.getElementById('soundBtn'); const l0 = btn.textContent; btn.click(); const l1 = btn.textContent; btn.click(); const l2 = btn.textContent; btn.click(); const l3 = btn.textContent; return { hasSrc, len, text: s1.textContent, labels: [l0, l1, l2, l3] }; });
    ok(t.len <= 40, '穂肥の 吹き出しは 短い（注つきでも 40字 まで）', t);
    ok(/ふるえ/.test(t.labels[0]) && /音だけ/.test(t.labels[1]) && /なし/.test(t.labels[2]) && /ふるえ/.test(t.labels[3]), '音ボタンは 音＋ふるえ → 音だけ → なし → もどる', t.labels);
  },
  // なにも しないで 1年 すぎると「おわり」
  async idle(b){
    const p = await page(b, 390, 844);
    const r = await p.evaluate(() => { K3.manual = true; K3.fixedSeed = 5; K3.start(); for (let i=0;i<400 && !K3.S.over;i++) K3.advanceDay(); return { over: K3.S.over, day: K3.S.day, result: K3.S.result, shown: !document.getElementById('result').hidden, title: document.getElementById('resTitle').textContent }; });
    ok(r.over && r.day === 365 && r.result === null && r.shown, '365日 すぎると 結果（収穫なし）', r);
  },
  // 字が はみ出ない：390×844 と 360×560（本物の Android の Chrome の 高さ）で、おもな 画面の 字が 画面の 中・吹き出しが 田んぼと かさならない
  async fit(b){
    for (const [w, h, dsf] of [[390, 844], [360, 560], [740, 360], [195, 280, 4]]){ /* 低い 横向き・字 200%（幅 195px・倍率 4）も（7周目） */
      const p = await page(b, w, h, dsf);
      const r = await p.evaluate(() => {
        const out = {}; const inside = el => { const r = el.getBoundingClientRect(); return r.left >= -1 && r.top >= -1 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1 && el.scrollWidth <= el.clientWidth + 1; };
        const vis = el => el.getBoundingClientRect().width > 0;
        const sb = document.getElementById('soundBtn').getBoundingClientRect(), nr = document.querySelector('#title .noren').getBoundingClientRect(); out.sound = sb.bottom <= nr.top + 1 || sb.left >= nr.right - 1 || sb.right <= nr.left + 1;
        out.title = ['whoT'].every(id => inside(document.getElementById(id))) && [...document.querySelectorAll('#title .swipes div')].every(el => el.scrollWidth <= el.clientWidth + 1 && el.getBoundingClientRect().right <= innerWidth + 1);
        K3.manual = true; K3.fixedSeed = 11;
        const scenes = ['seed', 'nursery', 'tiller', 'nakaboshi', 'heading', 'harvest', 'dry'];
        out.scenes = {};
        for (const s of scenes){ K3.jump(s); steps(30); const hud = ['date','wx','stat','stage','dayNo'].map(id => document.getElementById(id)); const say = document.getElementById('say'); const talk = document.getElementById('talk');
          const L = K3.layout(); const tr = talk.getBoundingClientRect();
          out.scenes[s] = { hud: hud.every(inside), hudBad: hud.filter(el => !inside(el)).map(el => el.id + ':' + el.textContent), say: inside(say) && vis(say), talkTop: Math.round(tr.top), fieldBot: Math.round(L.fieldBot), sayH: Math.round(say.getBoundingClientRect().height), text: say.textContent.slice(0, 20) }; }
        K3.jump('result'); out.result = ['rank', 'rYield', 'rTawara', 'rSeiryu', 'rTaste', 'rSay', 'rSay2'].every(id => { const el = document.getElementById(id); el.scrollIntoView({ block:'center' }); return inside(el); });
        const again = document.getElementById('againBtn'); out.againTop = inside(again); document.getElementById('result').scrollTop = 1e6; out.again = inside(again); /* はりついて いるので 送る 前でも 見える（14周目） */
        return out;
      });
      ok(r.title && r.sound, `題の 画面の 字が 画面の 中、音ボタンが のれんと かさならない（${w}×${h}）`, { title: r.title, sound: r.sound });
      for (const [s, v] of Object.entries(r.scenes)) ok(v.hud && v.say && v.talkTop >= v.fieldBot - 2, `${s}：HUD・吹き出しが 画面の 中、田んぼと かさならない（${w}×${h}）`, v);
      ok(r.result && r.again && r.againTop, `結果の 字と「もう一回」が 画面の 中（送る 前から 見える）（${w}×${h}）`, { result: r.result, again: r.again, againTop: r.againTop });
      await p.screenshot({ path: path.join(OUT, `fit-${w}x${h}.png`) });
      await p.close(); pages.splice(pages.indexOf(p), 1);
    }
  },
  // 重さ：1コマ 60ms を こえない（出穂の あと、株が いちばん 多い とき）
  async perf(b){
    const p = await page(b, 390, 844);
    const r = await p.evaluate(() => { K3.manual = true; K3.fixedSeed = 11; K3.jump('heading'); const t0 = performance.now(); for (let i=0;i<30;i++) K3.step(1/60); return (performance.now()-t0)/30; });
    ok(r < 60, '1コマ 60ms 以内', Math.round(r*10)/10 + 'ms');
  },
};

let fails = 0;
function ok(cond, name, info){ console.log((cond ? '  ✔ ' : '  ✖ ') + name + (cond || info===undefined ? '' : '  ' + JSON.stringify(info))); if (!cond) fails++; }
let errs = [];
const pages = [];
async function page(b, w, h, dsf){
  const p = await b.newPage({ viewport:{ width:w, height:h }, deviceScaleFactor:dsf||2, hasTouch:true }); pages.push(p);
  p.on('pageerror', e => errs.push(e.message));
  await p.goto(FILE); await p.waitForFunction(() => window.K3);
  await p.evaluate(HELPERS);
  return p;
}
(async () => {
  const b = await chromium.launch();
  for (const [name, fn] of Object.entries(CHECKS)){
    if (only.length && !only.includes(name)) continue;
    console.log(name); try { await fn(b); } catch (e) { ok(false, name + ' が 止まった', e.message); }
    while (pages.length) await pages.pop().close();
  }
  ok(errs.length===0, 'ページの エラー なし', errs);
  await b.close();
  console.log(fails ? `✖ ${fails} こ 失敗` : '✔ ぜんぶ 通った', '（スクショ：' + OUT + '）');
  process.exit(fails ? 1 : 0);
})();
