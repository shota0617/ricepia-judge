// ミシン糸 一本どり：通しの 確かめ（本物の ポインタイベントで 遊んで、こわれて いないか 見る）
//   node tools/mishin/check.js            # ぜんぶ
//   node tools/mishin/check.js practice   # 名前で えらぶ（practice one pinch tangle fever keys keyedge decor coin season fonts sound perf）
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
  // 書き方の 確かめ：script の 構文（1行の 関数に // の コメントを 足して 後ろを 消す まちがいを すぐ 見つける）
  async syntax(){
    const src = fs.readFileSync(FILE.replace('file://',''), 'utf-8'), scripts = [...src.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
    const bad = []; scripts.forEach((sc, i) => { try { new Function(sc); } catch (e) { bad.push(i + ': ' + e.message); } });
    ok(bad.length===0, 'script の 構文', bad);
  },
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
        KB.up(); steps(150); /* れんしゅうは あいて 2.2 秒 */ log.push(bb.tangles);
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
        ev('pointerup',1,x,y); steps(150); log.push(engaged);
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
    const d = await p.evaluate(() => {
      ev('pointerup',1,0,0); ev('pointerup',2,0,0); // 前の 確かめの 指を はなす
      KB.manual = true; KB.fixedSeed = 3; KB.start(); const S = KB.S, L = KB.layout();
      const bb = KB.makeBag(6); Object.assign(bb, { face:'back', start:'L', slide:0, single:false }); S.bag = bb;
      let x = L.x0, y = L.seamY; ev('pointerdown',1,x-8,y); ev('pointerdown',2,x+8,y);
      for (let i=0;i<20;i++){ ev('pointermove',1,x-8-i*2,y+i*3); ev('pointermove',2,x+8-i*2,y+i*3); KB.step(1/60); } x -= 40; y += 60;
      for (let i=0;i<80 && !bb.tangle;i++){ x += 45; ev('pointermove',1,x-8,y); ev('pointermove',2,x+8,y); KB.step(1/60); }
      for (let i=0;i<3;i++){ x += 2; ev('pointermove',1,x-8,y); ev('pointermove',2,x+8,y); KB.step(1/60); } // とじた まま 少し 動かす
      return { tangled: !!bb.tangle, taps: bb.tangle ? bb.tangle.taps : -1 };
    });
    ok(d.tangled && d.taps===0, 'もつれた あと、とじた ままの 指で ただで ほぐせない', d);
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
  // キーボード（れんしゅう だけ）：スペースで 裏返す、←→で つまんで 引く。赤く なったら はなす。読み上げの 欄も 見る
  async keys(b){
    const p = await page(b, 1280, 800, '#coin');
    const r = await p.evaluate(() => {
      KB.manual = true; steps(30); const S = KB.S, log = [];
      const key = (t, k) => document.dispatchEvent(new KeyboardEvent(t, { key:k, bubbles:true }));
      for (let k=0;k<3;k++){
        const bb = S.bag; steps(30);
        if (bb.face==='front'){ key('keydown',' '); key('keyup',' '); steps(40); }
        const arrow = bb.start==='R' ? 'ArrowRight' : 'ArrowLeft'; let held = false, rest = 0;
        for (let i=0;i<6000 && !bb.done;i++){
          if (bb.tangle){ if (held){ key('keyup',arrow); held=false; } key('keydown',' '); key('keyup',' '); steps(8); continue; }
          if (!S.held && held){ key('keyup',arrow); held=false; }
          const lim = bb.knots.has(bb.pulled) ? 0.8 : 0.9;
          if (held && S.tension > lim){ key('keyup',arrow); held=false; rest = 4; }
          if (!held && rest-- <= 0){ key('keydown',arrow); held=true; }
          KB.step(1/60);
        }
        if (held) key('keyup',arrow); steps(150); log.push(bb.tangles);
      }
      const sr = document.getElementById('sr').textContent;
      return { mode:S.mode, bagNo:S.bagNo, tangles:log, sr, focus:document.activeElement && document.activeElement.id };
    });
    ok(r.mode==='over' && r.bagNo===3, 'キーボードだけで れんしゅう 3袋', r);
    await p.waitForTimeout(100);
    r.sr = await p.evaluate(() => document.getElementById('sr').textContent); // 同じ 文でも 読むよう、一度 空に してから 入る
    ok(r.sr.length > 0, '読み上げの 欄に 声が 入る', r.sr);
    const f = await p.evaluate(() => document.activeElement && document.activeElement.id);
    ok(f==='practiceAgain', 'まとめで「もう一回」に フォーカス', f);
    const q = await page(b, 1280, 800, '');
    const t = await q.evaluate(() => {
      KB.manual = true; KB.start(); steps(30); const S = KB.S;
      document.dispatchEvent(new KeyboardEvent('keydown', { key: S.bag.start==='R' ? 'ArrowRight' : 'ArrowLeft', bubbles:true })); steps(5);
      return { held:S.held, phase:S.bag.phase };
    });
    ok(!t.held && t.phase==='look', 'タイムアタックは キーボードでは つまめない（二本指）', t);
  },
  // キーボードの 取りのこし：窓を はなれる・マウスと まぜる・ボタンの スペース・袋の かわりめ
  async keyedge(b){
    const p = await page(b, 1280, 800, '#coin');
    const key = (t, k, el) => p.evaluate(([t, k, el]) => (el ? document.getElementById(el) : document).dispatchEvent(new KeyboardEvent(t, { key:k, bubbles:true })), [t, k, el]);
    const r1 = await p.evaluate(() => {
      KB.manual = true; steps(30); const S = KB.S, bb = S.bag; if (bb.face==='front'){ KB.tap(640, KB.layout().seamY+200); steps(40); }
      document.dispatchEvent(new KeyboardEvent('keydown', { key: bb.start==='R' ? 'ArrowRight' : 'ArrowLeft', bubbles:true })); steps(5);
      const held = S.held; window.dispatchEvent(new Event('blur')); steps(60);
      return { held, after:S.held, tangles:bb.tangles };
    });
    ok(r1.held && !r1.after && r1.tangles===0, '窓を はなれたら キーを はなした ことに', r1);
    const r2 = await p.evaluate(() => {
      KB.startPractice(); const S = KB.S; steps(30); const bb = S.bag; if (bb.face==='front'){ KB.tap(640, KB.layout().seamY+200); steps(40); }
      const L = KB.layout(), ex = bb.start==='R' ? L.x1 : L.x0; ev('pointerdown',9,ex,L.seamY,'mouse'); ev('pointermove',9,ex,L.seamY+30,'mouse'); KB.step(1/60);
      const px = S.px, phase = bb.phase;
      document.dispatchEvent(new KeyboardEvent('keydown', { key: bb.start==='R' ? 'ArrowRight' : 'ArrowLeft', bubbles:true })); const px2 = S.px;
      document.dispatchEvent(new KeyboardEvent('keyup', { key: bb.start==='R' ? 'ArrowRight' : 'ArrowLeft', bubbles:true })); ev('pointerup',9,ex,L.seamY+30,'mouse'); return { phase, px, px2 };
    });
    ok(r2.px===r2.px2, 'マウスで つまんでいる 間は キーで 手が とばない', r2);
    const r3 = await p.evaluate(() => { KB.startPractice(); steps(30); const S = KB.S, f = S.bag.face, btn = document.querySelector('.steps .skip');
      btn.focus(); btn.dispatchEvent(new KeyboardEvent('keydown', { key:' ', bubbles:true })); for (let i=0;i<40;i++) KB.step(1/60); return { f, after:S.bag.face }; });
    ok(r3.f===r3.after, 'ボタンの スペースで 袋が 裏返らない', r3);
    const r5 = await p.evaluate(() => { KB.startPractice(); steps(30); const S = KB.S, bb = S.bag; if (bb.face==='front'){ KB.tap(640, KB.layout().seamY+200); steps(40); }
      const btn = document.getElementById('soundBtn'); btn.focus(); const k = bb.start==='R' ? 'ArrowRight' : 'ArrowLeft';
      btn.dispatchEvent(new KeyboardEvent('keydown', { key:k, bubbles:true })); const held = S.held; btn.dispatchEvent(new KeyboardEvent('keyup', { key:k, bubbles:true })); return { held }; });
    ok(r5.held, 'ボタンに フォーカスが あっても 矢印で つまめる', r5);
    const r4 = await p.evaluate(() => {
      KB.startPractice(); const S = KB.S; for (let i=0;i<30;i++) KB.step(1/60); const bb = S.bag;
      if (bb.face==='front'){ KB.tap(640, KB.layout().seamY+200); for (let i=0;i<40;i++) KB.step(1/60); }
      const k = bb.start==='R' ? 'ArrowRight' : 'ArrowLeft'; document.dispatchEvent(new KeyboardEvent('keydown', { key:k, bubbles:true }));
      for (let i=0;i<4000 && S.bag===bb;i++){ if (S.tension>0.8){ document.dispatchEvent(new KeyboardEvent('keyup', { key:k, bubbles:true })); KB.step(1/60); document.dispatchEvent(new KeyboardEvent('keydown', { key:k, bubbles:true })); } KB.step(1/60); }
      return { next: S.bag!==bb, held:S.held, phase:S.bag.phase };
    });
    ok(r4.next && !r4.held && r4.phase==='look', 'キーを おしたまま つぎの 袋に なっても つまんだ ままに ならない', r4);
  },
  // かざり（素朴な かわいさ）：横向きで 吹き出しが「−1秒」を かくさない・はじめから やりなおすと もどる・動きを へらす 設定・れんしゅうの 帯
  async decor(b){
    const p = await page(b, 844, 390, '');
    await p.evaluate(() => { KB.manual = true; KB.start(); for (let i=0;i<5;i++) KB.step(1/60); });
    await p.waitForTimeout(50);
    await p.evaluate(() => { const S = KB.S; S.msg = { text:'表でした。袋を まわしましょう', kind:'ng', t:0.5, life:2 }; S.msgY = undefined; });
    await p.waitForTimeout(100); // 1コマ かかせる
    const m = await p.evaluate(() => { const td = document.getElementById('timeDelta'), cv = document.getElementById('cv'); // 動く 前の「−1秒」の 下はし
      return { msgY: KB.S.msgY, msgTop: KB.S.msgTop, tdBottom: td.offsetTop + Math.max(td.offsetHeight, 22) - cv.offsetTop }; });
    ok(m.msgTop > m.tdBottom, '横向きでも 吹き出しが「−1秒」の 下（吹き出しの 上はし で）', m);
    const c = await p.evaluate(() => { const S = KB.S; S.hopT = [0.3, 0.4]; S.peckT = 0.4; KB.start(); return { reset: S.hopT[0]===0 && S.peckT===0 }; });
    ok(c.reset, 'はじめから やりなおすと スズメの はね・首かしげは もどる', c);
    const w = await p.evaluate(() => { KB.start(); const S = KB.S, L = KB.layout(); const bb = KB.makeBag(3); Object.assign(bb, { face:'back', start:'L', slide:0, single:false }); S.bag = bb;
      KB.down(L.x1-2, L.seamY); KB.up(); return { mark:S.mark, markT:S.markT }; });
    ok(w.mark==='？' && w.markT>0, '縫い始めを つまむと スズメが「？」', w);
    const h = await p.evaluate(() => { KB.start(); KB.audio.fever(); const n0 = KB.audio.timers.length; KB.start(); return { n0, n1: KB.audio.timers.length }; });
    ok(h.n0>0 && h.n1===0, 'おくれて 鳴る 音は はじめから やりなおすと 止まる', h);
    const cm = await p.evaluate(() => { KB.calm = true; KB.start(); const S = KB.S, L = KB.layout(); const bb = KB.makeBag(0); Object.assign(bb, { face:'back', start:'L', slide:0, phase:'pull', from:'L', pulled:1 }); S.bag = bb;
      const c = document.getElementById('cv'), shot = () => c.getContext('2d').getImageData(0, 0, c.width, c.height).data; KB.step(1/60); return true; });
    await p.waitForTimeout(60); const s1 = await p.evaluate(() => { const c = document.getElementById('cv'); return c.toDataURL().length; });
    await p.evaluate(() => { KB.S.t += 0.37; }); await p.waitForTimeout(60); const s2 = await p.evaluate(() => { const c = document.getElementById('cv'); const r = c.toDataURL().length; KB.calm = false; return r; });
    ok(s1===s2, '動きを へらす 設定では 1袋目の 見本の 点が 動かない', { s1, s2 });
    const z = await p.evaluate(() => { KB.calm = true; KB.start(); const slide = KB.S.bag.slide; KB.calm = false; KB.S.time = 0.01; for (let i=0;i<60;i++) KB.step(1/60); return { slide }; });
    await p.waitForTimeout(150);
    const sr = await p.evaluate(() => document.getElementById('sr').textContent);
    ok(z.slide===1, '動きを へらす 設定でも 袋を 待つ 時間は 同じ（点が かわらない。絵だけ すべらせない）', z);
    ok(/てんすう/.test(sr), 'おわりの 点が 読み上げの 欄に 入る', sr);
    const lb = await p.evaluate(() => { KB.start(); const S = KB.S, L = KB.layout(); const bb = KB.makeBag(1); Object.assign(bb, { face:'back', start:'L', slide:0, single:false, knots:new Set() }); S.bag = bb;
      KB.down(L.x0+2, L.seamY); for (let i=0;i<12;i++){ KB.move(L.x0+2-i*3, L.seamY+i*3); KB.step(1/60); }
      let x = L.x0+40; KB.down(x, L.seamY+70); for (let i=0;i<40 && bb.pulled<3;i++){ x += 3; KB.move(x, L.seamY+70); KB.step(1/60); }
      S.time = 0.01; KB.step(1/60); const mid = S.mode; for (let i=0;i<400 && !bb.done;i++){ x += S.tension>0.8 ? 0.5 : 3; KB.move(x, L.seamY+70); KB.step(1/60); }
      for (let i=0;i<120;i++) KB.step(1/60); return { mid, last:S.lastBag, done:bb.done, bags:S.bags, mode:S.mode }; });
    ok(lb.mid==='play' && lb.last && lb.done && lb.bags===1 && lb.mode==='over', '時間ぎれでも 引いている 袋は ラスト1袋 として あけられる', lb);
    // 53周目の レビュー：ラスト1袋で つまんだ まま 止まると おわらない・時計が もどる・「ラスト1袋」と「そこまで」が 同時・きつい目が 5つ
    const hang = await p.evaluate(() => { KB.start(); const S = KB.S, L = KB.layout(); const bb = KB.makeBag(1); Object.assign(bb, { face:'back', start:'L', slide:0, single:false, knots:new Set() }); S.bag = bb;
      KB.down(L.x0+2, L.seamY); for (let i=0;i<12;i++){ KB.move(L.x0+2-i*3, L.seamY+i*3); KB.step(1/60); }
      let x = L.x0+40; KB.down(x, L.seamY+70); for (let i=0;i<40 && bb.pulled<3;i++){ x += 3; KB.move(x, L.seamY+70); KB.step(1/60); }
      S.time = 0.01; KB.step(1/60); const last = S.lastBag; for (let i=0;i<60*5;i++) KB.step(1/60); /* つまんだ まま 動かさない */
      const t0 = S.time; return { last, mode:S.mode, t0 }; });
    ok(hang.last && hang.mode==='over', 'ラスト1袋で つまんだ まま 止まって いても おわる', hang);
    const back = await p.evaluate(() => { KB.start(); const S = KB.S, L = KB.layout(); const bb = KB.makeBag(1); Object.assign(bb, { face:'back', start:'L', slide:0, single:false, knots:new Set() }); S.bag = bb; S.feverT = 3;
      KB.down(L.x0+2, L.seamY); for (let i=0;i<12;i++){ KB.move(L.x0+2-i*3, L.seamY+i*3); KB.step(1/60); }
      let x = L.x0+40; KB.down(x, L.seamY+70); for (let i=0;i<40 && bb.pulled<3;i++){ x += 3; KB.move(x, L.seamY+70); KB.step(1/60); }
      S.time = 0.01; KB.step(1/60); let maxT = 0; for (let i=0;i<600 && !bb.done;i++){ x += S.tension>0.8 ? 0.5 : 3; KB.move(x, L.seamY+70); KB.step(1/60); maxT = Math.max(maxT, S.time); }
      for (let i=0;i<120;i++){ KB.step(1/60); maxT = Math.max(maxT, S.time); } return { maxT, done:bb.done, mode:S.mode }; });
    ok(back.done && back.maxT===0 && back.mode==='over', 'ラスト1袋の あいだと あけた あと 時計が もどらない', back);
    await p.waitForTimeout(400);
    const ag = await p.evaluate(() => { const r = document.getElementById('againBtn').getBoundingClientRect(); return { top:r.top, bottom:r.bottom, H:innerHeight }; });
    ok(ag.top >= 0 && ag.bottom <= ag.H, '横向きでも 結果の「もう一回」が 画面の 中に ある', ag);
    await p.evaluate(() => { document.getElementById('sr').textContent = ''; });
    const both = await p.evaluate(() => { KB.start(); const S = KB.S, L = KB.layout(); const bb = KB.makeBag(1); Object.assign(bb, { face:'back', start:'L', slide:0, single:false, knots:new Set() }); S.bag = bb;
      KB.down(L.x0+2, L.seamY); for (let i=0;i<12;i++){ KB.move(L.x0+2-i*3, L.seamY+i*3); KB.step(1/60); }
      let x = L.x0+40; KB.down(x, L.seamY+70); for (let i=0;i<40 && bb.pulled<3;i++){ x += 3; KB.move(x, L.seamY+70); KB.step(1/60); }
      KB.up(); for (let i=0;i<60;i++) KB.step(1/60); S.time = 0.01; KB.step(1/60); return { last:S.lastBag, ending:S.ending>0 }; });
    await p.waitForTimeout(150);
    const sr2 = await p.evaluate(() => document.getElementById('sr').textContent);
    ok(!both.last && both.ending && !/ラスト/.test(sr2), 'はなして いる ときに 時間ぎれなら「ラスト1袋」と 言わずに おわる', { both, sr2 });
    const kn = await p.evaluate(() => { let mx = 0; for (let k=0;k<40;k++) for (let s=0;s<8;s++) mx = Math.max(mx, KB.makeBag(k).knots.size); return mx; });
    ok(kn===4, 'きつい目は さいだい 4つ', kn);
  },
  // お客さん目線（31周目）：れんしゅうで 表の 端を さわると 裏返す・途中で やめると はんこを 出さない・つぎの 袋に 前の 声を もちこさない
  async coin(b){
    const p = await page(b, 360, 640, '#coin');
    const r = await p.evaluate(() => { KB.manual = true; const S = KB.S; for (let i=0;i<30;i++) KB.step(1/60);
      const bb = S.bag; bb.face = 'front'; const L = KB.layout(); ev('pointerdown',1,L.x0+4,L.seamY); ev('pointerup',1,L.x0+4,L.seamY); for (let i=0;i<40;i++) KB.step(1/60);
      return { face: bb.face }; });
    ok(r.face==='back', 'れんしゅうで 表の 端を さわると 裏返す', r);
    const zw = await p.evaluate(() => { const S = KB.S; for (let i=0;i<40;i++) KB.step(1/60); const bb = S.bag, z = S.zoom;
      ev('pointerdown',4,z.cx,z.cy); ev('pointerup',4,z.cx,z.cy); for (let i=0;i<40;i++) KB.step(1/60); return { face: bb.face }; });
    ok(zw.face==='back', 'れんしゅうで 拡大窓を さわっても 袋が 裏返らない', zw);
    const m = await p.evaluate(() => { const S = KB.S; S.bag.done = true; S.bag.open = 0; S.msg = { text:'あいた！', kind:'ok', t:0, life:2.5 }; for (let i=0;i<150;i++) KB.step(1/60); return { bagNo:S.bagNo, msg: S.msg && S.msg.text }; });
    ok(m.bagNo===1 && !m.msg, 'つぎの 袋に 前の 声を もちこさない', m);
    // 55周目（お客さん目線）：前の 袋から おいた ままの 指で つぎの 袋を まわさない
    const st = await p.evaluate(() => { const S = KB.S, L = KB.layout(), W = KB.size().W; ev('pointerdown',7,W/2,L.seamY+300); S.bag.done = true; S.bag.open = 0; for (let i=0;i<150;i++) KB.step(1/60);
      const bb = S.bag; bb.face = 'front'; bb.slide = 0; bb.flipT = 0; ev('pointermove',7,W/2+80,L.seamY+300); KB.step(1/60); const r = { bagNo:S.bagNo, flip:bb.flipT }; ev('pointerup',7,W/2+80,L.seamY+300); return r; });
    ok(st.bagNo===2 && st.flip===0, 'まえの 袋から おいた ままの 指で つぎの 袋を まわさない', st);
    await p.click('#skipBtn');
    const h = await p.evaluate(() => ({ hanko: getComputedStyle(document.querySelector('#coinDone .hanko')).display, small: document.getElementById('coinSmall').textContent }));
    ok(h.hanko==='none' && h.small==='取り方の まとめ', '途中で やめたら「よく できました」は 出さない', h);
  },
  // 55周目（お客さん目線）：タイムアタックで 1本指で なぞると 字でも 言う・0袋の ときの ヒント
  async customer(b){
    const p = await page(b, 390, 844, '');
    const r = await p.evaluate(() => { KB.manual = true; KB.start(); const S = KB.S, L = KB.layout(); S.bag.slide = 0; for (let i=0;i<5;i++) KB.step(1/60);
      ev('pointerdown',3,L.x0+4,L.seamY+200); ev('pointermove',3,L.x0+60,L.seamY+200); const msg = S.msg && S.msg.text; ev('pointerup',3,L.x0+60,L.seamY+200);
      S.time = 0.01; for (let i=0;i<120;i++) KB.step(1/60); return { msg, mode:S.mode }; });
    await p.waitForTimeout(200);
    const tip = await p.evaluate(() => document.getElementById('tip').textContent);
    ok(r.msg==='糸は 二本指で つまんで ください', 'タイムアタックで 1本指で なぞると「二本指で」と 字でも 言う', r);
    ok(r.mode==='over' && /二本指/.test(tip), '1袋も あけられなかった ときは つまみ方の ヒント', tip);
    // 57周目の レビュー：二本指で つまんで 1本 はなした あとに「二本指で」と 言わない・つまんだ 人には 0袋でも べつの ヒント・低い 横向きでも「もう一回」が 見える
    const pin = await p.evaluate(() => { KB.start(); const S = KB.S, L = KB.layout(); S.bag.slide = 0; S.bag.face = 'back'; for (let i=0;i<5;i++) KB.step(1/60); S.msg = null;
      const x = L.x0+2, y = L.seamY; ev('pointerdown',11,x-10,y); ev('pointerdown',12,x+10,y); for (let i=1;i<=10;i++){ ev('pointermove',11,x-10+i*8,y+i*4); ev('pointermove',12,x+10+i*8,y+i*4); KB.step(1/60); }
      const held = S.held; ev('pointerup',12,x+90,y+40); ev('pointermove',11,x+80,y+60); KB.step(1/60); const msg = S.msg && S.msg.text; ev('pointerup',11,x+80,y+60); return { held, msg }; });
    ok(pin.held && pin.msg!=='糸は 二本指で つまんで ください', '二本指で つまんで 1本 はなしても「二本指で」と 言わない', pin);
    const tip2 = await p.evaluate(() => { KB.start(); const S = KB.S; S.wrongs = 3; S.time = 0.01; for (let i=0;i<120;i++) KB.step(1/60); return document.getElementById('tip').textContent; });
    ok(!/まずは/.test(tip2), 'つまめた 人には 0袋でも べつの ヒント', tip2);
    // 59周目（もう一回）：じこベストまで あと 何点・こえた ときは 遊んで いる 間にも・はじめての ランク
    await p.setViewportSize({ width:390, height:844 });
    const bs = await p.evaluate(() => { localStorage.setItem('mishin-best2', '5000'); KB.start(); const S = KB.S; S.score = 4000; S.time = 0.01; for (let i=0;i<120;i++) KB.step(1/60);
      const gap = document.getElementById('best').innerHTML;
      KB.start(); S.score = 5100; KB.step(1/60); const said = S.msg && S.msg.text; S.score = 8000; S.time = 0.01; for (let i=0;i<120;i++) KB.step(1/60);
      return { gap, said, up: document.getElementById('best').innerHTML }; });
    ok(/あと 1,001点/.test(bs.gap), 'じこベストに とどかない ときは「じこベストまで あと 何点」', bs.gap);
    ok(bs.said==='じこベストを こえました！', '遊んで いる 間に じこベストを こえたら 言う', bs.said);
    ok(/<b>じこベスト更新/.test(bs.up) && /はじめて「頼れるパートさん」/.test(bs.up), 'じこベスト更新は 金の 字・はじめての ランクも 出る', bs.up);
    // 60周目（見えにくさ 4回目）：おわりの 読み上げに 金の 行・タイムアタックの キャンバスの 名前・キーの 人には キーの ことばと 見える フォーカス
    await p.waitForTimeout(200);
    const a11 = await p.evaluate(() => ({ sr: document.getElementById('sr').textContent, lbl: document.getElementById('cv').getAttribute('aria-label') }));
    ok(/じこベスト更新/.test(a11.sr), 'おわりの 読み上げに「じこベスト更新」も 入る', a11.sr);
    ok(/タイムアタック/.test(a11.lbl), 'タイムアタックの キャンバスの 名前は れんしゅうの 文を のこさない', a11.lbl);
    const kb = await p.evaluate(async () => { document.dispatchEvent(new KeyboardEvent('keydown', { key:'Tab', bubbles:true })); KB.startPractice(); const S = KB.S; S.bag.slide = 0; S.bag.face = 'back'; for (let i=0;i<5;i++) KB.step(1/60); await new Promise(r => setTimeout(r, 200)); /* 帯は 毎コマの syncUI が 作る */
      const sn = document.getElementById('stepNow'), t = sn ? sn.textContent : 'なし'; S.bagNo = 2; S.bag.done = true; S.bag.open = 0; for (let i=0;i<160;i++) KB.step(1/60); return t; });
    await p.waitForTimeout(200);
    const fv = await p.evaluate(() => { const el = document.activeElement, r = el.getBoundingClientRect(); return { id: el.id, top:r.top, bottom:r.bottom, H:innerHeight }; });
    ok(/←・→キー/.test(kb), 'キーで 遊ぶ 人には れんしゅうの 帯も キーの ことば', kb);
    ok(fv.id==='practiceAgain' && fv.bottom <= fv.H + 1, 'キーで 遊ぶ 人には まとめの フォーカスが 見える 所に', fv);
    // 61周目の レビュー：おまけの 行は 新しい じこベスト・0袋で 1回 まちがえた 人には その わけ・Ctrl では キーの 人に しない
    const r61 = await p.evaluate(() => { const ids = KB.GOALS.map(g=>g.id); localStorage.setItem('mishin-goals', JSON.stringify({ day: (()=>{ const d = new Date(); return d.getFullYear()+'-'+(d.getMonth()+1)+'-'+d.getDate(); })(), done: ids }));
      localStorage.setItem('mishin-best2', '5000'); KB.start(); const S = KB.S; S.score = 9000; S.time = 0.01; for (let i=0;i<120;i++) KB.step(1/60);
      const bonus = (document.querySelector('#rGoals .bonus')||{}).textContent || '';
      KB.start(); S.wrongs = 1; S.time = 0.01; for (let i=0;i<120;i++) KB.step(1/60); const tip = document.getElementById('tip').textContent;
      document.dispatchEvent(new PointerEvent('pointerdown', { bubbles:true })); document.dispatchEvent(new KeyboardEvent('keydown', { key:'=', ctrlKey:true, bubbles:true }));
      KB.startPractice(); S.bag.slide = 0; S.bag.face = 'back'; return { bonus, tip }; });
    await p.waitForTimeout(200);
    const sn61 = await p.evaluate(() => document.getElementById('stepNow').textContent);
    ok(!r61.bonus || /9,000/.test(r61.bonus), 'おまけの 行は 新しい じこベストの 点', r61.bonus);
    ok(/白い輪にささっている/.test(r61.tip), '0袋で 1回 まちがえた 人には その わけの ヒント', r61.tip);
    ok(/指を おいて/.test(sn61), 'Ctrl＋（拡大）では キーの ことばに かえない', sn61);
    for (const [w, h] of [[568,320],[667,375],[740,360],[320,568],[360,640],[375,667]]){ await p.setViewportSize({ width:w, height:h });
      const ag = await p.evaluate(() => { KB.start(); KB.S.time = 0.01; for (let i=0;i<120;i++) KB.step(1/60); const r = document.getElementById('againBtn').getBoundingClientRect(); return { b:r.bottom, H:innerHeight }; });
      ok(ag.b <= ag.H, `低い 画面（${w}×${h}）でも「もう一回」が 画面の 中`, ag); }
    // 72周目：画面の 幅で むずかしさが かわらない（引く 長さに あわせて 速さの 上限も。広い 画面は 1.12 倍 まで）
    const sf = {}; for (const [w, h] of [[360,640],[390,844],[768,1024]]){ await p.setViewportSize({ width:w, height:h }); await p.waitForTimeout(100);
      sf[w] = await p.evaluate(() => { const L = KB.layout(), b = KB.makeBag(0); return +(b.safe / ((L.x1-L.x0))).toFixed(3); }); }
    ok(Math.abs(sf[360]-sf[390]) < 0.02 && sf[768] < sf[390], '画面の 幅で 引く 速さの 上限が かわらない（広い 画面は 1.12 倍で 頭うち）', sf);
    // リストづくり：まとめと 結果に お店の LINE の 友だち追加（どこから 来たかの from つき）。手元では 解析は 動かない
    const ln = await p.evaluate(() => [...document.querySelectorAll('a.lineAdd')].map(a => ({ from: new URL(a.href).searchParams.get('from'), host: new URL(a.href).hostname, rel: a.rel, inCoin: !!a.closest('#coinDone'), inRes: !!a.closest('#result') })).concat([{ analyticsOn: window.nsgAnalytics ? window.nsgAnalytics.on : 'none' }]));
    ok(ln.some(l => l.inCoin && l.from==='mishin-coin') && ln.some(l => l.inRes && l.from==='mishin-result') && ln.filter(l => l.host).every(l => l.host==='ricepia.jp' && /noopener/.test(l.rel)) && ln[ln.length-1].analyticsOn===false, 'まとめと 結果に LINE の 友だち追加（from つき）・手元では 解析は 動かない', ln);
    // 76周目（こめつぶの 会話の 点検）：れんしゅうの 1袋目の 裏は タップで まわらない
    await p.setViewportSize({ width:390, height:844 });
    const pr = await p.evaluate(() => { KB.startPractice(); const S = KB.S, L = KB.layout(); S.bag.slide = 0; S.bag.face = 'back'; KB.tap(KB.size().W/2, L.seamY + 200); for (let i=0;i<40;i++) KB.step(1/60); return { face:S.bag.face, flip:S.bag.flipT }; });
    ok(pr.face==='back' && pr.flip===0, 'れんしゅうの 1袋目の 裏は 袋を タップしても まわらない', pr);
    const lp = await p.evaluate(async () => { KB.startPractice(); const S = KB.S, L = KB.layout(); S.bag.slide = 0; S.bag.face = 'front'; S.bag.k = 1;
      ev('pointerdown',21,L.x0+30,L.seamY+30); await new Promise(r => setTimeout(r, 700)); ev('pointerup',21,L.x0+30,L.seamY+30); for (let i=0;i<5;i++) KB.step(1/60); return { flip:S.bag.flipT }; });
    ok(lp.flip > 0, 'れんしゅうの 表は 長押しでも まわる', lp);
    // 78周目：低い 画面の 題でも ボタンが 見える・2行の 吹き出しが 縫い目や メーターに かからない
    for (const [w, h] of [[667,375],[844,390],[320,568]]){ await p.setViewportSize({ width:w, height:h }); await p.waitForTimeout(100);
      const tb = await p.evaluate(() => { document.getElementById('result').hidden = true; document.getElementById('coinDone').hidden = true; const t = document.getElementById('title'); t.hidden = false; t.scrollTop = 0; document.body.classList.add('menu'); const r = document.getElementById('practiceBtn').getBoundingClientRect(); t.hidden = true; document.body.classList.remove('menu'); return { b:r.bottom, H:innerHeight }; }); /* あとの 確かめに のこさない */
      ok(tb.b <= tb.H, `低い 画面（${w}×${h}）の 題で「れんしゅう」の ボタンが 見える`, tb); }
    await p.setViewportSize({ width:320, height:568 }); await p.waitForTimeout(100);
    const bb = await p.evaluate(() => { document.getElementById('title').hidden = true; KB.start(); const S = KB.S, L = KB.layout(); const b = KB.makeBag(0); Object.assign(b, { face:'back', slide:0 }); S.bag = b; S.msg = { text:'裏ですね。端の 赤い 糸を つまんで ください', kind:'ok', t:0.5, life:2 }; return new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r({ top:S.msgTop, y:S.msgY, seam:L.seamY })))); });
    ok(bb.y + (bb.y - bb.top) + 9 <= bb.seam - 16, '320 幅で 2行の 吹き出しも 縫い目に かからない', bb);
    // 82周目：れんしゅうの 拡大窓は 右手の 親指（下の 角 → 左の 端）で かくれない 所・帯と 音ボタンに かからない
    for (const [w, h] of [[390,844],[360,640],[320,568],[844,390],[568,320]]){ await p.setViewportSize({ width:w, height:h }); await p.waitForTimeout(100);
      const zz = await p.evaluate(async () => { KB.startPractice(); const S = KB.S; S.bag.slide = 0; await new Promise(r => setTimeout(r, 250)); const L = KB.layout(), z = S.zoom, W = KB.size().W, H = KB.size().H;
        const snd = document.getElementById('soundBtn').getBoundingClientRect(), cv = document.getElementById('cv').getBoundingClientRect();
        const t = Math.max(0, Math.min(1, ((z.cx - W) * (L.x0 - W) + (z.cy - H) * (L.seamY - H)) / ((L.x0 - W)**2 + (L.seamY - H)**2))), px = W + t*(L.x0 - W), py = H + t*(L.seamY - H); /* 親指の 線（右下の 角 → 左の 端） */
        return { thumb: Math.hypot(z.cx - px, z.cy - py) - z.r, banner: z.cy - z.r - (S.bannerBottom||0), sound: (snd.top - cv.top) - (z.cy + z.r) > 0 || (snd.left - cv.left) > z.cx + z.r, inside: z.cx - z.r >= 0 && z.cx + z.r <= W && z.cy + z.r <= H }; });
      ok(zz.thumb > 20 && zz.banner >= 0 && zz.sound && zz.inside, `れんしゅうの 拡大窓が 画面の 中・親指・帯・音ボタンに かからない（${w}×${h}）`, zz); }
    // 83周目：れんしゅうの 声は 上の 帯の こめつぶが 言う（袋の 上に 吹き出しを 出さない）
    await p.setViewportSize({ width:390, height:844 }); await p.waitForTimeout(100);
    const pm = await p.evaluate(() => { KB.startPractice(); const S = KB.S; S.bag.slide = 0; S.msgY = undefined; S.msg = { text:'その 調子です', kind:'ok', t:0.1, life:2 }; KB.step(1/60);
      return new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r({ band: document.getElementById('stepNow').textContent, y: S.msgY })))); });
    ok(/その 調子です/.test(pm.band) && pm.y === undefined, 'れんしゅうの 声は 上の 帯に 出て、袋の 上に 吹き出しは 出ない', pm);
    // 84周目（見えにくさ 5）：あいた 袋は「白糸は 自然に ぬけます」も 言う・まとめと 結果では キャンバスを 読まない・字 200%（幅 195）
    const dn = await p.evaluate(() => { KB.startPractice(); const S = KB.S; S.bag.slide = 0; KB.step(1/60); S.bag.phase = 'pull'; S.bag.done = true; S.bag.open = 0; S.msg = { text:'一本どり！', kind:'ok', t:0.1, life:2 }; KB.step(1/60); return new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r(document.getElementById('stepNow').textContent)))); });
    ok(/一本どり/.test(dn) && /白糸は 自然に ぬけます/.test(dn), 'れんしゅうの あいた 袋で「白糸は 自然に ぬけます」も 帯に 出る', dn);
    const ah = await p.evaluate(() => { KB.start(); const S = KB.S; S.time = 0.01; for (let i=0;i<120;i++) KB.step(1/60); return new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r({ res: !document.getElementById('result').hidden, cv: document.getElementById('cv').getAttribute('aria-hidden') })))); });
    ok(ah.res && ah.cv === 'true', '結果の 間は キャンバス（前の 袋の 文）を 読み上げない', ah);
    await p.setViewportSize({ width:195, height:422 }); await p.waitForTimeout(100);
    const z2 = await p.evaluate(() => { const r = [...document.querySelectorAll('#result .talk>.say')].map(e => e.getBoundingClientRect().right); return { right: Math.max(...r), W: innerWidth }; });
    ok(z2.right <= z2.W + 1, '幅 195（字 200% の かわり）で 結果の 吹き出しが はみ出さない', z2);
    const z3 = await p.evaluate(async () => { document.getElementById('result').hidden = true; KB.startPractice(); const S = KB.S; S.bag.slide = 0; for (let i=0;i<3;i++){ KB.step(1/60); await new Promise(r => requestAnimationFrame(r)); } return { seam: KB.layout().seamY, banner: S.bannerBottom, H: KB.size().H }; });
    ok(z3.seam >= z3.banner + 20, '幅 195 の れんしゅうで 上の 帯が 縫い目を かくさない', z3);
    await p.setViewportSize({ width:390, height:844 }); await p.waitForTimeout(100);
    await p.setViewportSize({ width:320, height:568 }); // 65周目：じこベスト・はじめての ランク・袋の じこベストの 行が ふえても
    const ag4 = await p.evaluate(() => { localStorage.setItem('mishin-best2','5000'); localStorage.setItem('mishin-bestbags','3'); KB.start(); const S = KB.S; S.score = 8000; S.bags = 9; S.time = 0.01; for (let i=0;i<120;i++) KB.step(1/60);
      const r = document.getElementById('againBtn').getBoundingClientRect(); return { b:r.bottom, H:innerHeight, lines: document.getElementById('best').innerHTML.split('<br>').length }; });
    ok(ag4.b <= ag4.H, '320×568 で 結果の 行が ふえても「もう一回」が 画面の 中', ag4);
    const fev = await p.evaluate(() => { KB.start(); const S = KB.S; S.feverT = 4.2; S.score = 48060; for (let i=0;i<3;i++) KB.step(1/60); return new Promise(r => setTimeout(() => { const c = document.getElementById('combo'), t = document.getElementById('time').getBoundingClientRect(); r({ fit: c.scrollWidth <= c.clientWidth + 1, mid: Math.round(t.left + t.width/2), W: innerWidth }); }, 100)); });
    const st69 = await p.evaluate(() => { const S = KB.S; S.time = 0.01; for (let i=0;i<120;i++) KB.step(1/60); document.getElementById('result').scrollTop = 300; KB.start(); S.time = 0.01; for (let i=0;i<120;i++) KB.step(1/60); return document.getElementById('result').scrollTop; });
    ok(st69===0, 'つぎの 結果は いちばん 上から（前の 回の 位置を のこさない）', st69);
    ok(fev.fit && Math.abs(fev.mid - fev.W/2) <= 2, '320 でも フィーバーの 字が 1行に 入り 時計が まん中', fev);
  },
  // 新米の きせつ（34周目）：8/15〜12/31 だけ 新米シール。産年は 収穫の 年（農林水産省・愛知県）
  async season(b){
    const p = await page(b, 390, 844, '');
    const r = await p.evaluate(() => { const out = {};
      for (const d of ['2026-10-28', '2027-03-10', '2026-08-25']) { KB.today = d; const bag = KB.makeBag(4); out[d] = { year: KB.riceYear(new Date(d)), golden: bag.golden, brand: bag.brand, kaori: KB.riceYear(new Date(d), 'あいちのかおり') }; }
      KB.today = null; return out; });
    ok(r['2026-10-28'].golden && r['2026-10-28'].year===2026, '秋は その年が 産年で 新米シール', r['2026-10-28']);
    ok(r['2026-08-25'].golden && r['2026-08-25'].brand!=='あいちのかおり' && r['2026-08-25'].kaori===2025, '8月下旬は あいちのかおりの 新米は まだ ない（10月中旬から）', r['2026-08-25']);
    ok(!r['2027-03-10'].golden && r['2027-03-10'].year===2026, '春は 前の 年が 産年で 新米シールなし', r['2027-03-10']);
  },
  // フォントは 使う 字だけ（tools/mishin/fonts.py）。字を 書き足したら 回す
  async fonts(){
    const r = require('child_process').spawnSync('python3', [path.resolve(__dirname, 'fonts.py'), '--check'], { cwd: path.resolve(__dirname, '../..'), encoding:'utf-8' });
    ok(r.status===0, 'フォントの 字に もれが ない', (r.stdout||'') + (r.stderr||''));
  },
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
    // 58周目：れんしゅうの 拡大窓（見る 間）は 毎コマ 画面を 自分に うつさない
    const z = await p.evaluate(async () => { KB.startPractice(); const S = KB.S; await new Promise(r => setTimeout(r, 600));
      const orig = CanvasRenderingContext2D.prototype.drawImage; let self = 0; const cv = document.getElementById('cv');
      CanvasRenderingContext2D.prototype.drawImage = function(src, ...a){ if (src===cv) self++; return orig.call(this, src, ...a); };
      await new Promise(res => { let n=0; (function f(){ if (++n<30) requestAnimationFrame(f); else res(); })(); });
      CanvasRenderingContext2D.prototype.drawImage = orig; return { self, phase:S.bag.phase }; });
    ok(z.phase==='look' && z.self <= 1, 'れんしゅうの 拡大窓は 見る 間 1回 だけ うつす', z);
  },
};

let fails = 0;
function ok(cond, name, info){ console.log((cond ? '  ✔ ' : '  ✖ ') + name + (cond || info===undefined ? '' : '  ' + JSON.stringify(info))); if (!cond) fails++; }
let errs = [];
const pages = [];
async function page(b, w, h, hash, dsf){
  const p = await b.newPage({ viewport:{ width:w, height:h }, deviceScaleFactor:dsf||2 }); pages.push(p);
  p.on('pageerror', e => errs.push(e.message));
  await p.goto(FILE + hash); await p.waitForFunction(() => window.KB);
  if (hash==='#coin') await p.waitForFunction(() => KB.S.mode==='play'); // #coin は 袋の 絵が とどいて から れんしゅうが はじまる
  await p.evaluate(HELPERS);
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
