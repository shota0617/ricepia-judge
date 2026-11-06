// 米作り365：通しの 確かめ（本物の PointerEvent で スワイプして、日が 進む・水位が かわる・収穫まで 通る・字が はみ出ない、を 見る）
//   node tools/kome365/check.js            # ぜんぶ
//   node tools/kome365/check.js swipe      # 名前で えらぶ（syntax swipe water brake year fit）
// スクショは KOME_OUT（なければ OS の 一時フォルダの kome365-check）に 書く。リポジトリの 中には 書かない。
const { chromium } = require('playwright');
const path = require('path'), os = require('os'), fs = require('fs');
const FILE = 'file://' + (process.env.KOME_FILE || path.resolve(__dirname, '../../kome365.html')); // KOME_FILE で 前の 版を ためせる
const OUT = process.env.KOME_OUT || path.join(os.tmpdir(), 'kome365-check');
fs.mkdirSync(OUT, { recursive: true });
const only = process.argv.slice(2);

// ページの 中で 使う 道具：本物の タッチ（pointerType:'touch'）を #cv に 送る。swipe は 指を おろして 何点か 動かして はなす
const HELPERS = () => {
  window.ev = (t, id, x, y) => document.getElementById('cv').dispatchEvent(new PointerEvent(t, { pointerId:id, pointerType:'touch', clientX:x, clientY:y, bubbles:true, button:0, isPrimary:true }));
  window.steps = n => { for (let i=0;i<n;i++) K3.step(1/60); };
  // dir: 'up'|'down'|'left'|'right'。len は px、fast は はじく（点の 間を 大きく）
  window.swipe = (dir, len, fast) => {
    const W = innerWidth, H = innerHeight, cx = W/2, cy = H*0.5; const dx = dir==='right'?1:dir==='left'?-1:0, dy = dir==='down'?1:dir==='up'?-1:0;
    const n = fast ? 3 : 24; ev('pointerdown', 1, cx - dx*len/2, cy - dy*len/2); /* ゆっくり＝24コマ（0.4秒）、はじく＝3コマ */
    for (let i=1;i<=n;i++){ ev('pointermove', 1, cx - dx*len/2 + dx*len*i/n, cy - dy*len/2 + dy*len*i/n); K3.step(1/60); }
    ev('pointerup', 1, cx + dx*len/2, cy + dy*len/2); K3.step(1/60);
  };
  window.flush = () => { for (let i=0;i<400 && K3.V.flipQueue > 0;i++) K3.step(1/30); };
};

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
      K3.manual = true; K3.fixedSeed = 11; K3.start(); steps(5);
      const d0 = K3.S.day; swipe('right', 120, false); const d1 = K3.S.day; flush(); const d1b = K3.S.day;
      swipe('right', 260, true); const q = K3.V.flipQueue; const d2 = K3.S.day; flush(); const d3 = K3.S.day;
      // はじいて パラパラの とちゅうで ← を 入れると 止まる
      swipe('right', 260, true); steps(3); const dq = K3.S.day; swipe('left', 80, false); const q2 = K3.V.flipQueue; steps(60); const d4 = K3.S.day;
      return { d0, d1, d1b, q, d2, d3, dq, q2, d4, date: document.getElementById('date').textContent, dayNo: document.getElementById('dayNo').textContent };
    });
    ok(r.d1 === r.d0 + 1 && r.d1b === r.d1, 'ゆっくり →：1日 だけ 進む', r);
    ok(r.q >= 3 && r.d3 - r.d2 === r.q, 'はじく →：つづけて 何日も めくれる（慣性）', r);
    ok(r.q2 === 0 && r.d4 <= r.dq + 1, 'めくれて いる とちゅうの ← で 止まる', r);
    ok(/日$/.test(r.date) && r.dayNo === r.d4 + '日目', 'HUD の 日づけが 進む', r);
    await p.screenshot({ path: path.join(OUT, 'swipe.png') });
  },
  // ↑ で 水が 入り、↓ で 落ちる。スワイプの 長さで 量が かわる。水面は ばねで ついてくる
  async water(b){
    const p = await page(b, 390, 844);
    const r = await p.evaluate(() => {
      K3.manual = true; K3.fixedSeed = 11; K3.jump('tiller'); const f = K3.S.f; f.water = 2; K3.V.water = 2; K3.V.waterV = 0; steps(60);
      const w0 = f.water; swipe('up', 80, false); const w1 = f.water; swipe('up', 240, false); const w2 = f.water;
      const v0 = K3.V.water; steps(90); const v1 = K3.V.water;   // 見た目の 水面が 本当の 水に 追いつく
      swipe('down', 120, false); const w3 = f.water; swipe('down', 400, true); const w4 = f.water; steps(90); const v2 = K3.V.water;
      const stat = document.getElementById('stat').textContent;
      return { w0, w1, w2, v0, v1, w3, w4, v2, stat };
    });
    ok(r.w1 > r.w0 && r.w2 > r.w1, '↑ で 水が 入る。長い ほど 多い', r);
    ok(r.w2 - r.w1 > r.w1 - r.w0, 'スワイプの 長さで 量が かわる', r);
    ok(Math.abs(r.v1 - r.w2) < 0.3 && r.v0 < r.w2, '水面は 少し おくれて 追いつく（ばね）', r);
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
      for (let i=0;i<8 && !f.planted;i++) swipe('left', 120, false); log.push(['planted', f.planted, S.day]);
      let fert = 0, hoFert = 0, cuts = 0;
      for (let i=0;i<260 && !S.hv.done;i++){
        const a = K3.actions();
        if (a.left==='追肥'){ swipe('left', 120, false); fert++; }
        if (a.left==='穂肥'){ swipe('left', 120, false); hoFert++; }
        if (a.left==='刈る' && f.gdd >= 980){ swipe('left', 160, true); cuts++; continue; }
        // 水：はじめ 深め → 分げつ 浅く → 中干し（dat 34〜44）→ 水を もどす → 出穂の あとは 切らさない。暑い 日は 入れかえる
        if (f.dat < 10){ if (f.water < 4) swipe('up', 140, false); }
        else if (f.dat < 34){ if (f.water < 1.5) swipe('up', 60, false); else if (f.water > 4) swipe('down', 60, false); }
        else if (f.dat <= 44){ if (f.water > 0) swipe('down', 400, true); }
        else { if (f.water < 2) swipe('up', 120, false); else if (f.heading && S.weather[S.day].w==='高温') swipe('up', 60, false); }
        tick();
      }
      log.push(['harvest', S.hv.done, S.day, Math.round(f.gdd), cuts, fert, hoFert, f.hoshiDays]);
      for (let i=0;i<8 && S.hv.moisture > 15.5;i++) tick(); log.push(['dry', S.hv.moisture]);
      swipe('left', 120, false);
      const res = S.result;
      return { log, over: S.over, phase: S.phase, result: res && { grade: res.grade, yield: Math.round(res.yieldKg), seiryu: Math.round(res.seiryu), taste: res.taste }, shown: !document.getElementById('result').hidden, rank: document.getElementById('rank').textContent, day: S.day, swipes: S.swipes, T: Math.round(f.T), H: Math.round(f.H) };
    });
    const L = Object.fromEntries(r.log);
    ok(L.soak === true, '↑ で 種を 水に つける', L);
    ok(L.sprout === true, '→ を くり返すと 芽が 出る', L);
    ok(r.log[2][1] === 'nursery', '↓ で まく → 苗の 場面', r.log[2]);
    ok(r.log[4][1] === 'field' && r.log[5][1] === true, '← 4回で 田うえ', r.log.slice(3,6));
    ok(r.log[6][1] === true && r.log[6][3] >= 950 && r.log[6][4] >= 5, '出穂後 1000℃ ちかくで ← 5回 刈る', r.log[6]);
    ok(r.log[6][5] === 1 && r.log[6][6] === 1 && r.log[6][7] >= 5, '追肥・穂肥・中干しが できた', r.log[6]);
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
      K3.jump('harvest'); while (!K3.S.hv.done) K3.doLeft(); const m0 = K3.S.hv.moisture;
      swipe('right', 260, true); flush(); const m1 = K3.S.hv.moisture, q = K3.V.flipQueue; const stat = document.getElementById('stat').textContent;
      swipe('right', 100, false); flush(); const m2 = K3.S.hv.moisture;
      return { card, cardOn, cardOff, m0, m1, q, stat, m2, left: K3.actions().left, wx: document.getElementById('wx').textContent };
    });
    ok(r.card && r.cardOn && r.cardOff, '← 見る で 1株の 札が 出て、消える', r);
    ok(r.m0 === 25 && r.m1 <= 15.5 && r.m1 >= 14 && r.q === 0, 'はじいても 15% で 止まる（乾燥機の 仕上がり）', r);
    ok(r.m2 < 14 && r.left === 'けんさ', 'もう一度 → すると 乾かしすぎ（それでも 検査へ 行ける）', r);
    ok(/あす/.test(r.wx), 'HUD に あすの 天気', r.wx);
    await p.screenshot({ path: path.join(OUT, 'dry.png') });
  },
  // なにも しないで 1年 すぎると「おわり」
  async idle(b){
    const p = await page(b, 390, 844);
    const r = await p.evaluate(() => { K3.manual = true; K3.fixedSeed = 5; K3.start(); for (let i=0;i<400 && !K3.S.over;i++) K3.advanceDay(); return { over: K3.S.over, day: K3.S.day, result: K3.S.result, shown: !document.getElementById('result').hidden, title: document.getElementById('resTitle').textContent }; });
    ok(r.over && r.day === 365 && r.result === null && r.shown, '365日 すぎると 結果（収穫なし）', r);
  },
  // 字が はみ出ない：390×844 と 360×560（本物の Android の Chrome の 高さ）で、おもな 画面の 字が 画面の 中・吹き出しが 田んぼと かさならない
  async fit(b){
    for (const [w, h] of [[390, 844], [360, 560]]){
      const p = await page(b, w, h);
      const r = await p.evaluate(() => {
        const out = {}; const inside = el => { const r = el.getBoundingClientRect(); return r.left >= -1 && r.top >= -1 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1 && el.scrollWidth <= el.clientWidth + 1; };
        const vis = el => el.getBoundingClientRect().width > 0;
        out.title = ['startBtn', 'whoT'].every(id => inside(document.getElementById(id))) && [...document.querySelectorAll('#title .swipes div')].every(inside);
        K3.manual = true; K3.fixedSeed = 11;
        const scenes = ['seed', 'nursery', 'tiller', 'nakaboshi', 'heading', 'harvest', 'dry'];
        out.scenes = {};
        for (const s of scenes){ K3.jump(s); steps(30); const hud = ['date','wx','stat','stage','dayNo'].map(id => document.getElementById(id)); const say = document.getElementById('say'); const talk = document.getElementById('talk');
          const L = K3.layout(); const tr = talk.getBoundingClientRect();
          out.scenes[s] = { hud: hud.every(inside), hudBad: hud.filter(el => !inside(el)).map(el => el.id + ':' + el.textContent), say: inside(say) && vis(say), talkTop: Math.round(tr.top), fieldBot: Math.round(L.fieldBot), sayH: Math.round(say.getBoundingClientRect().height), text: say.textContent.slice(0, 20) }; }
        K3.jump('result'); out.result = ['rank', 'rYield', 'rTawara', 'rSeiryu', 'rTaste', 'rSay', 'rSay2'].every(id => { const el = document.getElementById(id); el.scrollIntoView({ block:'center' }); return inside(el); });
        const again = document.getElementById('againBtn'); document.getElementById('result').scrollTop = 1e6; out.again = inside(again);
        return out;
      });
      ok(r.title, `題の 画面の 字が 画面の 中（${w}×${h}）`, r);
      for (const [s, v] of Object.entries(r.scenes)) ok(v.hud && v.say && v.talkTop >= v.fieldBot - 2, `${s}：HUD・吹き出しが 画面の 中、田んぼと かさならない（${w}×${h}）`, v);
      ok(r.result && r.again, `結果の 字と「もう一回」が 画面の 中（${w}×${h}）`, r);
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
async function page(b, w, h){
  const p = await b.newPage({ viewport:{ width:w, height:h }, deviceScaleFactor:2, hasTouch:true }); pages.push(p);
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
