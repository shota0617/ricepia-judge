// ミシン糸 一本どり：通しの 確かめ（本物の ポインタイベントで 遊んで、こわれて いないか 見る）
//   node tools/mishin/check.js            # ぜんぶ
//   node tools/mishin/check.js practice   # 名前で えらぶ（practice one pinch tangle sound perf）
// スクショは MISHIN_OUT（なければ OS の 一時フォルダの mishin-check）に 書く。リポジトリの 中には 書かない。
const { chromium } = require('playwright');
const path = require('path'), os = require('os'), fs = require('fs');
const FILE = 'file://' + (process.env.MISHIN_FILE || path.resolve(__dirname, '../../mishin.html')); // MISHIN_FILE で 前の 版を ためせる
const OUT = process.env.MISHIN_OUT || path.join(os.tmpdir(), 'mishin-check');
fs.mkdirSync(OUT, { recursive: true });
const only = process.argv.slice(2);

// ページの 中で 使う 道具：本物の タッチ（pointerType:'touch'）や マウスの イベントを #cv に 送る
const HELPERS = () => {
  window.ev = (t, id, x, y, type) => document.getElementById('cv').dispatchEvent(new PointerEvent(t, { pointerId:id, pointerType:type||'touch', clientX:x, clientY:y, bubbles:true, button:0 }));
  window.steps = n => { for (let i=0;i<n;i++) KB.step(1/60); };
};

const CHECKS = {
  // れんしゅう（#coin）：3袋を KB の 手で 通して、まとめが 出る
  async practice(b){
    const p = await page(b, 390, 844, '#coin');
    const r = await p.evaluate(() => {
      KB.manual = true; steps(30);
      const S = KB.S, L = () => KB.layout(), log = [];
      for (let bag=0; bag<3; bag++){
        const bb = S.bag;
        if (bb.face==='front'){ KB.tap(W2=180, L().seamY+200); steps(40); }
        const l = L(); KB.down(l.x0+2, l.seamY+4); for (let i=0;i<20;i++){ KB.move(l.x0+2-i*3, l.seamY+4+i*3); KB.step(1/60); }
        let x = l.x0+20;
        for (let i=0;i<3000 && !bb.done;i++){
          if (bb.tangle){ KB.up(); const step=(l.x1-l.x0)/bb.N, wx=l.x0-step*0.1+22, wy=l.seamY+36; KB.down(wx,wy); for (let k=0;k<12;k++){ KB.move(wx, wy+k*5); KB.step(1/60);} KB.up(); continue; }
          if (!S.held){ x = l.x0+20; KB.down(x, l.seamY+50); }
          x += bb.knots.has(bb.pulled) ? 1.5 : 5; KB.move(x, l.seamY+50); if (x > l.x1-20) KB.up(); KB.step(1/60);
        }
        KB.up(); steps(60); log.push(bb.tangles);
      }
      return { mode:S.mode, bagNo:S.bagNo, tangles:log, summary:!document.getElementById('coinDone').hidden };
    });
    await p.screenshot({ path: path.join(OUT, 'practice-summary.png') });
    ok(r.mode==='over' && r.bagNo===3 && r.summary, 'れんしゅう 3袋 → まとめ', r);
    ok(r.tangles[2] >= 1, 'れんしゅう 3袋目は わざと 引っかかる', r.tangles);
  },
  // れんしゅうを 1本指（本物の touch）だけで 通す。360×640
  async one(b){
    const p = await page(b, 360, 640, '#coin');
    const r = await p.evaluate(() => {
      KB.manual = true; steps(30); const S = KB.S, log = [];
      for (let k=0;k<3;k++){
        const L = KB.layout(), bb = S.bag; steps(30);
        if (bb.face==='front'){ ev('pointerdown',1,180,L.seamY+200); ev('pointerup',1,180,L.seamY+200); steps(40); }
        const sd = bb.start==='R' ? -1 : 1; let x = bb.start==='R' ? L.x1 : L.x0, y = L.seamY;
        ev('pointerdown',1,x,y); for (let i=0;i<20;i++){ x += -sd; y += 3; ev('pointermove',1,x,y); KB.step(1/60); }
        const engaged = bb.phase;
        let down = true;
        for (let i=0;i<4000 && !bb.done;i++){
          if (bb.tangle){ if (down){ ev('pointerup',1,x,y); down=false; } ev('pointerdown',2,180,520); ev('pointerup',2,180,520); steps(8); continue; }
          if (!down){ x = sd>0 ? 60 : 300; y = L.seamY+60; ev('pointerdown',1,x,y); down=true; }
          x += sd*(bb.knots.has(bb.pulled) ? 1.5 : 5); ev('pointermove',1,x,y); KB.step(1/60);
          if (x>330 || x<30){ ev('pointerup',1,x,y); down=false; KB.step(1/60); }
        }
        ev('pointerup',1,x,y); steps(50); log.push(engaged);
      }
      return { mode:S.mode, engaged:log };
    });
    ok(r.mode==='over' && r.engaged.every(e=>e==='pull'), 'れんしゅうを 1本指で 通せる（360×640）', r);
  },
  // タイムアタック：1本指では つまめない・二本指で つまむと ほどける・指を ひらくと はなす
  async pinch(b){
    const p = await page(b, 390, 844, '');
    const r = await p.evaluate(() => {
      KB.manual = true; KB.fixedSeed = 1001; KB.start(); steps(40);
      const S = KB.S, L = KB.layout(), out = {};
      ev('pointerdown',1,L.x0+4,L.seamY); for (let i=0;i<30;i++){ ev('pointermove',1,L.x0+4+i*8,L.seamY+20); KB.step(1/60); } ev('pointerup',1,L.x0+240,L.seamY+20); KB.step(1/60);
      out.oneFinger = S.bag.phase;
      ev('pointerdown',1,L.x0,L.seamY-8); ev('pointerdown',2,L.x0+30,L.seamY+12); KB.step(1/60);
      for (let i=0;i<40;i++){ const dx=i*6; ev('pointermove',1,L.x0+dx,L.seamY-8+i); ev('pointermove',2,L.x0+30+dx,L.seamY+12+i); KB.step(1/60); }
      out.pinch = S.bag.phase; out.pulled = S.bag.pulled;
      ev('pointermove',2,L.x0+400,L.seamY+200); KB.step(1/60); out.heldAfterOpen = S.held;
      return out;
    });
    await p.screenshot({ path: path.join(OUT, 'pinch.png') });
    ok(r.oneFinger==='look', 'タイムアタックは 1本指で つまめない', r);
    ok(r.pinch==='pull' && r.pulled>0, '二本指で つまむと ほどける', r);
    ok(r.heldAfterOpen===false, '指を ひらくと はなす', r);
  },
  // もつれ：マウスで 白糸を 引く・れんしゅうで 1本指で 白糸を 引く・二本指で つまんだまま 引っかかって つまみなおし
  async tangle(b){
    const p = await page(b, 390, 844, '');
    const make = practice => p.evaluate(practice => {
      KB.manual = true; KB.fixedSeed = 3; practice ? KB.startPractice() : KB.start(); const S = KB.S, L = KB.layout();
      const bb = KB.makeBag(6); Object.assign(bb, { face:'back', start:'L', slide:0, single:false }); S.bag = bb;
      KB.down(L.x0+2, L.seamY); let x = L.x0; for (let i=0;i<20;i++){ x -= 3; KB.move(x, L.seamY+i*3); KB.step(1/60); }
      for (let i=0;i<80 && !bb.tangle;i++){ x += 45; KB.move(x, L.seamY+60); KB.step(1/60); }
      KB.up(); return !!bb.tangle;
    }, practice);
    const tug = (id, type) => p.evaluate(([id, type]) => {
      const S = KB.S, L = KB.layout(), bb = S.bag, step = (L.x1-L.x0)/bb.N, wx = L.x0-step*0.1+22, wy = L.seamY+36;
      ev('pointerdown',id,wx,wy,type); for (let i=0;i<14;i++){ ev('pointermove',id,wx,wy+i*5,type); KB.step(1/60); } ev('pointerup',id,wx,wy+70,type); KB.step(1/60);
      return !bb.tangle;
    }, [id, type]);
    ok(await make(false) && await tug(9, 'mouse'), 'マウスで 白糸を 引いて ほぐせる');
    ok(await make(true) && await tug(3, 'touch'), 'れんしゅうで 1本指で 白糸を 引いて ほぐせる');
    const c = await p.evaluate(() => {
      KB.manual = true; KB.fixedSeed = 3; KB.start(); const S = KB.S, L = KB.layout();
      const bb = KB.makeBag(6); Object.assign(bb, { face:'back', start:'L', slide:0, single:false }); S.bag = bb;
      let x = L.x0, y = L.seamY; ev('pointerdown',1,x-8,y); ev('pointerdown',2,x+8,y);
      for (let i=0;i<20;i++){ ev('pointermove',1,x-8-i*2,y+i*3); ev('pointermove',2,x+8-i*2,y+i*3); KB.step(1/60); } x -= 40; y += 60;
      for (let i=0;i<80 && !bb.tangle;i++){ x += 45; ev('pointermove',1,x-8,y); ev('pointermove',2,x+8,y); KB.step(1/60); }
      const tangled = !!bb.tangle, step = (L.x1-L.x0)/bb.N, wx = L.x0-step*0.1+22, wy = L.seamY+36;
      ev('pointermove',1,wx-80,wy); ev('pointermove',2,wx+80,wy); KB.step(1/60);
      ev('pointermove',1,wx-6,wy); ev('pointermove',2,wx+6,wy); KB.step(1/60);
      for (let i=0;i<12;i++){ ev('pointermove',1,wx-6,wy+i*6); ev('pointermove',2,wx+6,wy+i*6); KB.step(1/60); }
      return { tangled, after: !!bb.tangle };
    });
    ok(c.tangled && !c.after, '二本指で つまんだまま 引っかかっても、ひらいて とじれば 白糸を つまめる', c);
  },
  // フィーバー：×5 で はじまり、まちがえ（もつれ）たら おわる。袋が あく 間も 残り時間は へる
  async fever(b){
    const p = await page(b, 390, 844, '');
    const r = await p.evaluate(() => {
      KB.manual = true; KB.fixedSeed = 3; KB.start(); const S = KB.S, L = KB.layout();
      const bb = KB.makeBag(6); Object.assign(bb, { face:'back', start:'L', slide:0, single:true, knots:new Set() }); S.bag = bb;
      S.combo = 1; KB.down(L.x0+2, L.seamY); let x = L.x0;
      for (let i=0;i<200 && !S.feverT;i++){ x += 4; KB.move(x, L.seamY+60); KB.step(1/60); }
      const started = S.feverT > 0;
      for (let i=0;i<80 && !bb.tangle;i++){ x += 45; KB.move(x, L.seamY+60); KB.step(1/60); }
      steps(2);
      return { started, tangled: !!bb.tangle, feverAfter: S.feverT, combo: S.combo };
    });
    ok(r.started, 'スルスル ×5 で フィーバーが はじまる', r);
    ok(r.tangled && r.feverAfter===0 && r.combo<1, 'もつれたら フィーバーは おわり、倍率も さがる', r);
  },
  // 音・ふるえの 切りかえ（この 端末に おぼえる）
  async sound(b){
    const p = await page(b, 390, 844, '');
    const a = await p.textContent('#soundBtn'); await p.click('#soundBtn'); const c = await p.textContent('#soundBtn');
    await p.reload(); await p.waitForTimeout(200); const d = await p.textContent('#soundBtn');
    ok(a.includes('あり') && c.includes('なし') && d.includes('なし'), '音・ふるえの 切りかえを おぼえる', { a, c, d });
  },
  // 重さ：CPU 4倍 おそく して、引いている 間の 1コマの 時間（ヘッドレスは GPU なし。目安）
  async perf(b){
    const p = await page(b, 390, 844, '', 3);
    const cdp = await p.context().newCDPSession(p); await cdp.send('Emulation.setCPUThrottlingRate', { rate:4 });
    await p.waitForTimeout(300);
    const r = await p.evaluate(async () => {
      KB.fixedSeed = 7; KB.start(); const S = KB.S; S.bag = KB.makeBag(9); S.bag.face = 'back'; S.bag.slide = 0; S.combo = 1;
      const L = KB.layout(); KB.down(L.x0+4, L.seamY+40); const ts = []; let last = performance.now(), x = L.x0;
      await new Promise(res => { let n=0; (function f(){ x += 4; KB.move(x, L.seamY+40); const now = performance.now(); ts.push(now-last); last = now; if (++n<120) requestAnimationFrame(f); else res(); })(); });
      ts.sort((a,b)=>a-b); return { median:+ts[60].toFixed(1), p90:+ts[108].toFixed(1) };
    });
    console.log('  重さ（CPU 4倍 おそい・ヘッドレス）', r);
    ok(r.median < 60, '1コマ 60ms より 軽い', r);
  },
};

let fails = 0;
function ok(cond, name, info){ console.log((cond ? '  ✔ ' : '  ✖ ') + name + (cond || info===undefined ? '' : '  ' + JSON.stringify(info))); if (!cond) fails++; }
let errs = [];
const pages = [];
async function page(b, w, h, hash, dsf){
  const p = await b.newPage({ viewport:{ width:w, height:h }, deviceScaleFactor:dsf||2 }); pages.push(p);
  p.on('pageerror', e => errs.push(e.message));
  await p.goto(FILE + hash); await p.waitForFunction(() => window.KB); await p.evaluate(HELPERS);
  return p;
}
(async () => {
  const b = await chromium.launch();
  for (const [name, fn] of Object.entries(CHECKS)){
    if (only.length && !only.includes(name)) continue;
    console.log(name); try { await fn(b); } catch (e) { ok(false, name + ' が 止まった', e.message); }
    while (pages.length) await pages.pop().close(); // 1つ 確かめる ごとに 閉じる
  }
  ok(errs.length===0, 'ページの エラー なし', errs);
  await b.close();
  console.log(fails ? `✖ ${fails} こ 失敗` : '✔ ぜんぶ 通った', '（スクショ：' + OUT + '）');
  process.exit(fails ? 1 : 0);
})();
