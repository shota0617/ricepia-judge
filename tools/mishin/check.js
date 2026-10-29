// ミシン糸 一本どり：通しの 確かめ（本物の ポインタイベントで 遊んで、こわれて いないか 見る）
//   node tools/mishin/check.js            # ぜんぶ
//   node tools/mishin/check.js practice   # 名前で えらぶ（practice one pinch tangle fever keys keyedge decor coin season fonts nofont sound perf）
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
    const lb = scripts.filter(sc => /\(\?<[=!]/.test(sc)).length; ok(lb===0, '後読み (?<=) を 使わない（Safari 16.4 より 前で script ごと 止まる。87周目）', lb);
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
    ok(r.tangles[2] >= 1, 'れんしゅう 3袋目は わざと もつれる', r.tangles);
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
    // 97周目：同じ 袋で 2回目に もつれても 帯の 声を 読む（袋ごとに 1回 だけに して 2回目が 無音に なって いた）
    const t2 = await p.evaluate(async () => {
      const said = []; const sr = document.getElementById('sr'); const mo = new MutationObserver(() => { if (sr.textContent) said.push(sr.textContent); }); mo.observe(sr, { childList:true, characterData:true, subtree:true });
      const raf = () => new Promise(r => requestAnimationFrame(() => r())); KB.manual = true; KB.startPractice(); const S = KB.S; const st = async n => { for (let i=0;i<n;i++){ KB.step(1/60); await raf(); } };
      await st(30); const bb = S.bag, l = KB.layout(); KB.down(l.x0+2, l.seamY+4); for (let i=0;i<20;i++){ KB.move(l.x0+2-i*3, l.seamY+4+i*3); KB.step(1/60); await raf(); } await st(100);
      for (let t=0;t<2 && !bb.done;t++){ KB.up(); await st(5); let x = l.x0+20; KB.down(x, l.seamY+50);
        for (let i=0;i<400 && !bb.tangle;i++){ x += 40; if (x>l.x1){ KB.up(); x=l.x0+20; KB.down(x,l.seamY+50); } KB.move(x, l.seamY+50); KB.step(1/60); await raf(); }
        await st(10); KB.up(); for (let k=0;k<3;k++){ KB.tap((l.x0+l.x1)/2, l.seamY+150); await st(3); } await st(60); }
      mo.disconnect(); KB.manual = false; return { tangles: bb.tangles, reads: said.join('|').split('もつれました').length - 1 }; });
    ok(t2.tangles >= 2 && t2.reads >= 2, '同じ 袋で 2回目に もつれても 帯の 声を 読む', t2);
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
    ok(f==='coinH', 'まとめは 見出しに フォーカス（Tab で LINE →「もう一度」。96周目）', f);
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
    const zw = await p.evaluate(async () => { const S = KB.S; for (let i=0;i<40;i++) KB.step(1/60); for (let i=0; i<40 && !S.zoom; i++) await new Promise(r => setTimeout(r, 50)); /* 拡大窓が かかれる まで（92周目） */ const bb = S.bag, z = S.zoom;
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
    const bs = await p.evaluate(() => { localStorage.setItem('mishin-best2', '5000'); KB.start(); const S = KB.S; S.score = 4000; S.bags = 3; S.time = 0.01; for (let i=0;i<120;i++) KB.step(1/60);
      const gap = document.getElementById('best').innerHTML, again = document.getElementById('againBtn').textContent;
      KB.start(); S.score = 5100; KB.step(1/60); const said = S.msg && S.msg.text; S.score = 8000; S.time = 0.01; for (let i=0;i<120;i++) KB.step(1/60);
      return { gap, again, said, up: document.getElementById('best').innerHTML }; });
    ok(/あと 1,001点/.test(bs.gap) && /あと 1,001点/.test(bs.again || ''), 'じこベストに とどかない ときは「じこベストまで あと 何点」（「もう一回」の 中にも。103周目）', bs);
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
    ok(fv.id==='coinH' && fv.top >= 0 && fv.bottom <= fv.H + 1, 'キーで 遊ぶ 人には まとめの フォーカスが 見える 所に', fv);
    // 61周目の レビュー：おまけの 行は 新しい じこベスト・0袋で 1回 まちがえた 人には その わけ・Ctrl では キーの 人に しない
    const r61 = await p.evaluate(() => { const ids = KB.GOALS.map(g=>g.id); localStorage.setItem('mishin-goals', JSON.stringify({ day: (()=>{ const d = new Date(); return d.getFullYear()+'-'+(d.getMonth()+1)+'-'+d.getDate(); })(), done: ids }));
      localStorage.setItem('mishin-best2', '5000'); KB.start(); const S = KB.S; S.score = 9000; S.time = 0.01; for (let i=0;i<120;i++) KB.step(1/60);
      const bonus = (document.querySelector('#rGoals .bonus')||{}).textContent || '';
      localStorage.setItem('mishin-best2', '9000'); KB.start(); S.score = 5000; S.bags = 3; S.time = 0.01; for (let i=0;i<120;i++) KB.step(1/60); const bonus2 = (document.querySelector('#rGoals .bonus')||{}).textContent || '';
      KB.start(); S.score = 9000; S.bags = 3; S.time = 0.01; for (let i=0;i<120;i++) KB.step(1/60); const tie = document.getElementById('best').textContent;
      KB.start(); S.wrongs = 1; S.time = 0.01; for (let i=0;i<120;i++) KB.step(1/60); const tip = document.getElementById('tip').textContent;
      document.dispatchEvent(new PointerEvent('pointerdown', { bubbles:true })); document.dispatchEvent(new KeyboardEvent('keydown', { key:'=', ctrlKey:true, bubbles:true }));
      KB.startPractice(); S.bag.slide = 0; S.bag.face = 'back'; return { bonus, bonus2, tie, tip }; });
    await p.waitForTimeout(200);
    const sn61 = await p.evaluate(() => document.getElementById('stepNow').textContent);
    ok(!/おまけ/.test(r61.bonus) && !/おまけ/.test(r61.bonus2) && /あした/.test(r61.bonus2) && /おなじ 点/.test(r61.tie) && !/あと 0点/.test(r61.tie), 'ぜんぶ できた 行：じこベストを くり返さず「あしたは 新しい 目標」・同じ 点は「おなじ 点」（103・104・143周目）', r61);
    ok(/白い輪にささっている/.test(r61.tip), '0袋で 1回 まちがえた 人には その わけの ヒント', r61.tip);
    ok(/指を おいて/.test(sn61), 'Ctrl＋（拡大）では キーの ことばに かえない', sn61);
    for (const [w, h] of [[568,320],[667,375],[740,360],[320,568],[341,568],[360,640],[375,667]]){ await p.setViewportSize({ width:w, height:h });
      const ag = await p.evaluate(async () => { localStorage.setItem('mishin-best2', '123456'); KB.start(); const S = KB.S; S.score = 100; S.bags = 1; S.time = 0.01; /* 長い 数で 見る（113周目） */ for (let i=0;i<120;i++) KB.step(1/60); await new Promise(r => setTimeout(r, 400)); /* 結果が 落ちついて から（107周目） */ const r = document.getElementById('againBtn').getBoundingClientRect(); const vis = [...document.querySelectorAll('#againBtn small>span')].filter(e => getComputedStyle(e).display !== 'none').map(e => e.className).join(','); return { b:r.bottom, H:innerHeight, t: document.getElementById('againBtn').textContent, vis }; });
      ok(ag.b <= ag.H && /あと/.test(ag.t) && (w > 359 ? ag.vis === 'lg' : ag.vis === 'sh'), `低い 画面（${w}×${h}）でも「もう一回（…まで あと）」が 画面の 中・せまい 画面は みじかい 文`, ag); }
    // 72周目：画面の 幅で むずかしさが かわらない（引く 長さに あわせて 速さの 上限も。広い 画面は 1.12 倍 まで）
    const sf = {}; for (const [w, h] of [[360,640],[390,844],[768,1024]]){ await p.setViewportSize({ width:w, height:h }); await p.waitForTimeout(100);
      sf[w] = await p.evaluate(() => { const L = KB.layout(), b = KB.makeBag(0); return +(b.safe / ((L.x1-L.x0))).toFixed(3); }); }
    ok(Math.abs(sf[360]-sf[390]) < 0.02 && sf[768] < sf[390], '画面の 幅で 引く 速さの 上限が かわらない（広い 画面は 1.12 倍で 頭うち）', sf);
    // リストづくり：まとめと 結果に お店の LINE の 友だち追加（どこから 来たかの from つき）。手元では 解析は 動かない
    const ln = await p.evaluate(() => [...document.querySelectorAll('a.lineAdd')].map(a => ({ from: new URL(a.href).searchParams.get('from'), host: new URL(a.href).hostname, rel: a.rel, inCoin: !!a.closest('#coinDone'), inRes: !!a.closest('#result') })).concat([{ analyticsOn: window.nsgAnalytics ? window.nsgAnalytics.on : 'none' }]));
    ok(ln.some(l => l.inCoin && l.from==='mishin-coin') && ln.some(l => l.inRes && l.from==='mishin-result') && ln.filter(l => l.host).every(l => l.host==='ricepia.jp' && /noopener/.test(l.rel)) && (ln[ln.length-1].analyticsOn===false || (process.env.MISHIN_FILE && ln[ln.length-1].analyticsOn==='none')) /* MISHIN_FILE で スクラッチの 古い 版を ためす ときは analytics.js が 横に ない（142周目） */, 'まとめと 結果に LINE の 友だち追加（from つき）・手元では 解析は 動かない', ln);
    // 88周目（リストづくり 2）：まとめの LINE は 1画面目（手順の 前）、結果は「もう一回」の すぐ 下。134周目：ブラウザの バーを のぞいた 本物の 高さ（360×560・375×553）も
    for (const [w, h] of [[390,844],[360,640],[667,375],[844,390],[360,560],[375,553]]){ await p.setViewportSize({ width:w, height:h }); await p.waitForTimeout(100);
      const lc = await p.evaluate(() => { document.getElementById('result').hidden = true; const c = document.getElementById('coinDone'); c.hidden = false; c.scrollTop = 0; const r = c.querySelector('a.lineAdd').getBoundingClientRect(), g = document.getElementById('againBtn');
        const nx = g.nextElementSibling; c.hidden = true; return { b: r.bottom, H: innerHeight, next: nx && nx.classList.contains('line-talk') }; });
      ok(lc.b <= lc.H && lc.next, `まとめの LINE の ボタンが 1画面目（${w}×${h}）・結果は「もう一回」の すぐ 下`, lc); }
    // 90周目：結果の LINE も 1画面目（たて は ボタンを 文の 前、横向きは「もう一回」の すぐ 下）
    for (const [w, h] of [[390,844],[360,640],[667,375],[844,390],[360,560],[375,553]]){ await p.setViewportSize({ width:w, height:h }); await p.waitForTimeout(100);
      const rl = await p.evaluate(() => { KB.start(); const S = KB.S; S.score = 3200; S.bags = 4; S.time = 0.01; for (let i=0;i<120;i++) KB.step(1/60); const r = document.querySelector('#result a.lineAdd').getBoundingClientRect(); return { b: r.bottom, H: innerHeight }; });
      ok(rl.b <= rl.H, `結果の LINE の ボタンが 1画面目（${w}×${h}）`, rl); }
    await p.evaluate(() => { document.getElementById('result').hidden = true; });
    await p.setViewportSize({ width:390, height:844 }); await p.waitForTimeout(100);
    // 76周目（こめつぶの 会話の 点検）：れんしゅうの 1袋目の 裏は タップで まわらない
    await p.setViewportSize({ width:390, height:844 });
    const pr = await p.evaluate(() => { KB.startPractice(); const S = KB.S, L = KB.layout(); S.bag.slide = 0; S.bag.face = 'back'; KB.tap(KB.size().W/2, L.seamY + 200); for (let i=0;i<40;i++) KB.step(1/60); return { face:S.bag.face, flip:S.bag.flipT }; });
    ok(pr.face==='back' && pr.flip===0, 'れんしゅうの 1袋目の 裏は 袋を タップしても まわらない', pr);
    const lp = await p.evaluate(async () => { KB.startPractice(); const S = KB.S, L = KB.layout(); S.bag.slide = 0; S.bag.face = 'front'; S.bag.k = 1;
      ev('pointerdown',21,L.x0+30,L.seamY+30); await new Promise(r => setTimeout(r, 700)); ev('pointerup',21,L.x0+30,L.seamY+30); for (let i=0;i<5;i++) KB.step(1/60); return { flip:S.bag.flipT }; });
    ok(lp.flip > 0, 'れんしゅうの 表は 長押しでも まわる', lp);
    // 78周目：低い 画面の 題でも ボタンが 見える・2行の 吹き出しが 縫い目や メーターに かからない
    for (const [w, h] of [[667,375],[844,390],[320,568],[568,320]]){ await p.setViewportSize({ width:w, height:h }); await p.waitForTimeout(100);
      const tb = await p.evaluate(() => { document.getElementById('result').hidden = true; document.getElementById('coinDone').hidden = true; const t = document.getElementById('title'); t.hidden = false; t.scrollTop = 0; document.body.classList.add('menu'); const r = document.getElementById('practiceBtn').getBoundingClientRect(); t.hidden = true; document.body.classList.remove('menu'); return { b:r.bottom, H:innerHeight }; }); /* あとの 確かめに のこさない */
      ok(tb.b <= tb.H, `低い 画面（${w}×${h}）の 題で「れんしゅう」の ボタンが 見える`, tb); }
    // 131周目：キーの 人も きつい目では ゆっくりに なる（0.8 秒 おして はなす リズムで もつれない）・速すぎの 声は キーの ことば・本文の 目じるし
    const kk = await p.evaluate(async () => { const m0 = KB.manual, u0 = KB.kbUser ? KB.kbUser() : false; KB.manual = true; KB.startPractice(); const S = KB.S, b = S.bag; Object.assign(b, { slide:0, face:'back', phase:'pull', pulled:3 }); b.knots = new Set([3,4,5]);
      document.dispatchEvent(new KeyboardEvent('keydown', { key:'ArrowLeft', bubbles:true })); let maxT = 0; for (let i = 0; i < 48; i++){ KB.step(1/60); if (b.knots.has(b.pulled)) maxT = Math.max(maxT, S.tension); }
      S.over = 0.2; await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); b.knots = new Set(); await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); const say = document.getElementById('stepNow').textContent;
      document.dispatchEvent(new KeyboardEvent('keyup', { key:'ArrowLeft', bubbles:true })); S.over = 0; KB.kbUser && KB.kbUser(u0); /* キーの 人の 印を もとに（KB.start の 前に。読み上げの 予約を 出さない。133周目） */ KB.start(); KB.manual = m0; return { maxT:+maxT.toFixed(2), say, main: !!document.querySelector('[role=main] #cv') }; });
    ok(kk.maxT <= 1 && /キーを はなして/.test(kk.say) && kk.main, 'キーの 人も きつい目では ゆっくり・速すぎの 声は キーの ことば・本文の 目じるし', kk);
    // 133周目：結果の 顔の ない 吹き出しは 左を そろえる・れんしゅうの 速すぎの 声は もつれの ため 0.05 から（人が 気づける 間）
    const al = await p.evaluate(async () => { const m0 = KB.manual; KB.manual = true; KB.start(); const S = KB.S; S.score = 8420; S.bags = 7; S.time = 0.01; for (let i=0;i<200;i++) KB.step(1/60); await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      const lefts = [...document.querySelectorAll('#result .talk.cont>.say')].filter(e => e.offsetParent).map(e => Math.round(e.getBoundingClientRect().left));
      KB.startPractice(); const b = S.bag; Object.assign(b, { slide:0, face:'back', phase:'pull', pulled:2 }); b.knots = new Set(); S.held = true; S.tension = 1.2; S.over = 0.08; await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      const warn = document.getElementById('stepNow').textContent; S.held = false; S.over = 0; S.tension = 0; KB.start(); KB.manual = m0; return { lefts, warn }; });
    ok(al.lefts.length >= 2 && al.lefts.every(x => x === al.lefts[0]) && /速すぎ/.test(al.warn), '結果の 顔の ない 吹き出しは 左が そろう・速すぎの 声は 早めに', al);
    // 143周目：結果の ヒントは 目標 あと 1つを 先に・数は「速く」の ヒントの ときだけ・達成は「もう一回」の 中に・LINE の 説明は 1回目 だけ
    const r143 = await p.evaluate(async () => { const m0 = KB.manual; KB.manual = true; const S = KB.S, raf = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      try{ localStorage.removeItem('mishin-goals'); localStorage.setItem('mishin-best2', '999999'); }catch(e){} KB.ends && KB.ends(0); /* この ページで 1回目の 結果 から */ for (let t = Date.UTC(2026,9,1); !(KB.todayGoals().includes('quick8')); t += 864e5) KB.today = new Date(t).toISOString().slice(0,10); /* 早わざの 目標が ある 日に（144周目：その 日に ないと 空振り） */ const ids = KB.todayGoals();
      const end = (f) => { KB.start(); f(KB.S); KB.S.time = 0.01; for (let i=0;i<120;i++) KB.step(1/60); };
      end(S => { S.bags = 3; S.clean = 3; S.pullTime = 10; S.zoneTime = 1; S.quick = 7; S.bestStreak = 2; S.streak = 0; });
      await raf(); const tip1 = document.getElementById('tip').textContent, line1 = getComputedStyle(document.querySelector('#resLine .say>span')).display;
      end(S => { S.bags = 8; S.clean = 8; S.pullTime = 10; S.zoneTime = 8; S.tangles = 3; S.bestStreak = 5; S.rightClean = 1; S.quick = 8; });
      await raf(); const tip2 = document.getElementById('tip').textContent, btn2 = document.getElementById('againBtn').textContent, line2 = getComputedStyle(document.querySelector('#resLine .say>span')).display;
      try{ localStorage.removeItem('mishin-goals'); }catch(e){} end(S => { S.bags = 3; S.clean = 1; S.pullTime = 10; S.zoneTime = 1; S.quick = 7; S.tangles = 3; });
      await raf(); const tip3 = document.getElementById('tip').textContent; /* まちがいが 多い ときは 直し方が 先（144周目） */
      try{ localStorage.removeItem('mishin-goals'); }catch(e){}
      KB.manual = m0; KB.today = null; KB.start(); return { ids, tip1, tip2, tip3, btn2, line1, line2 }; });
    ok(r143.ids.includes('quick8') && /あと 1つ/.test(r143.tip1) && /もつれが多め/.test(r143.tip3) && !/緑で 引けた/.test(r143.tip2) && /達成/.test(r143.btn2) && r143.line1 !== 'none' && r143.line2 === 'none', '結果：目標 あと 1つを 先に・数は 速さの ヒントの ときだけ・達成は もう一回の 中・LINE の 説明は 1回目 だけ', r143);
    // 145周目：字 200%（幅 195px で かわりに 見る）でも「れんしゅう」を 途中で 切らない・「×2」と「+3秒」が かさならない
    await p.setViewportSize({ width:195, height:280 }); await p.waitForTimeout(150);
    const z145 = await p.evaluate(async () => { const t = document.getElementById('title'); t.hidden = false; document.body.classList.add('menu'); const btn = document.getElementById('practiceBtn'), tx = btn.firstChild, i = tx.textContent.indexOf('れんしゅう');
      const rr = k => { const r = document.createRange(); r.setStart(tx, k); r.setEnd(tx, k+1); return Math.round(r.getBoundingClientRect().top); }, sameLine = rr(i) === rr(i+4);
      t.hidden = true; document.body.classList.remove('menu'); const m0 = KB.manual; KB.manual = true; KB.start(); const S = KB.S; S.combo = 0.5; KB.step(1/60); await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      const ce = document.getElementById('combo'), rg = document.createRange(); rg.selectNodeContents(ce); const c = rg.getBoundingClientRect(), td = document.getElementById('timeDelta'); td.textContent = '+3秒'; const d = td.getBoundingClientRect(), d0 = d.left, cx = c.right, dTop = d.top, cBot = c.bottom, comboTxt = ce.textContent; S.feverT = 3; KB.step(1/60); await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); rg.selectNodeContents(ce); const cf = rg.getBoundingClientRect(), df = td.getBoundingClientRect(), feverApart = cf.right <= df.left || cf.bottom <= df.top || cf.top >= df.bottom; S.feverT = 0; KB.manual = m0; /* フィーバーの 字は 2行に なる（147周目） */ /* 字の 幅で はかる（箱は 列いっぱい。147周目） */
      return { sameLine, combo: comboTxt, comboRight: Math.round(cx), deltaLeft: Math.round(d0), apart: cx <= d0 || cBot <= dTop, feverApart }; });
    await p.setViewportSize({ width:390, height:844 }); await p.waitForTimeout(150);
    ok(z145.sameLine && /^×\d$/.test(z145.combo) && z145.apart && z145.feverApart, '字 200%：れんしゅうの ボタンを ことばの 途中で 切らない・倍率と 時間の 字が かさならない', z145);
    // 129周目：LINE は ricepia.jp の「価格表・売り出し情報」と 同じ リンク（ことばと あう）
    const lnk2 = await p.evaluate(() => [...document.querySelectorAll('a.lineAdd')].map(a => a.getAttribute('href')));
    ok(lnk2.length === 2 && lnk2.every(h => /\/lin\.ee\/AULbClm\?from=mishin-(coin|result)$/.test(h)), 'LINE の リンクは 価格表・売り出し情報の もの（from つき）', lnk2);
    // 128周目：れんしゅうで 速すぎると 帯が「ゆっくり」と 言う（ほめ言葉より 先）・題の ボタンの 時間は 2分
    const fw = await p.evaluate(async () => { const m0 = KB.manual, raf = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))), txt = () => document.getElementById('stepNow').textContent;
      KB.manual = true; KB.startPractice(); const S = KB.S, b = S.bag; Object.assign(b, { slide:0, face:'back', phase:'pull', pulled:2 }); b.knots = new Set([9]); S.held = true;
      S.tension = 1.3; S.over = 0.05; await raf(); const brief = txt(); /* 張りが 一瞬 こえた だけでは 言わない */
      S.over = 0.2; S.msg = { text:'その 調子です', kind:'ok', t:0.1, life:2 }; await raf(); const fast = txt();
      S.over = 0; S.tension = 0.5; await raf(); const hold = txt(); /* 0.6 秒は 出したまま（ちらつかない） */
      S.t += 0.7; S.msg = null; await raf(); const slow = txt();
      b.pulled = 9; S.over = 0.2; S.tension = 1.3; await raf(); const knot = txt(); /* きつい目の 声が 先 */
      S.held = false; S.over = 0; S.tension = 0; KB.start(); KB.manual = m0; /* 前の 状態に もどす */
      return { brief, fast, hold, slow, knot, btn: document.getElementById('practiceBtn').textContent }; });
    ok(!/速すぎ/.test(fw.brief) && /速すぎ/.test(fw.fast) && /速すぎ/.test(fw.hold) && !/速すぎ/.test(fw.slow) && /きつい目/.test(fw.knot) && /2分/.test(fw.btn), 'れんしゅうで もつれそうに なると 帯が ゆっくりと 言い、ちらつかず、きつい目の 声は 消さない', fw);
    // 127周目：手順の 吹き出しは 朱の 字を 1か所まで・結果の こめつぶは 見出しの 1つだけ・育つ 絵の 字は 段の 名前を くり返さない
    const kw = await p.evaluate(() => ({ reds: [...document.querySelectorAll('#coinDone .talks .say')].map(e => e.querySelectorAll('strong').length), faces: [...document.querySelectorAll('#result .talk:not(.cont)>.who')].length, cap: document.getElementById('growCap').textContent }));
    ok(kw.reds.length >= 5 && kw.reds.every(n => n <= 1) && kw.faces <= 1 && !/（.+さん|五代目|ベテラン|見習い|はじめての袋）/.test(kw.cap), '手順の 吹き出しの 朱は 1か所・結果の こめつぶは 1つ・育つ 絵の 字は くり返さない', kw);
    // 125周目：横向きでも 店の 名前（のれん）が 1画面目に・360×640 では あいさつが ボタンの 上で 両方 見える・題の 目標に ことばの 意味
    for (const [w, h, want] of [[844,390,'noren'],[667,375,'noren'],[360,640,'talk'],[320,601,'buttons']]){ /* 320×601：あいさつが 上に 来ると「ゲームで遊ぶ」の 下が 3px しか のこらなかった（126周目） */ await p.setViewportSize({ width:w, height:h }); await p.waitForTimeout(100);
      const tt = await p.evaluate(() => { document.getElementById('result').hidden = true; document.getElementById('coinDone').hidden = true; const t = document.getElementById('title'); t.hidden = false; t.scrollTop = 0; document.body.classList.add('menu'); let keep = null; try{ keep = localStorage.getItem('mishin-goals'); localStorage.removeItem('mishin-goals'); }catch(e){} KB.renderGoals && KB.renderGoals(); /* まだの 目標で 見る */
        const R = s => document.querySelector(s).getBoundingClientRect(), n = R('.noren'), k = R('#title .talk'), st = R('#startBtn'), pr = R('#practiceBtn');
        const o = { noren: n.height > 10 && n.bottom <= innerHeight, talkAbove: k.bottom <= pr.top && k.top >= 0, start: st.bottom <= innerHeight - 16, hints: document.querySelectorAll('#goals .goal:not(.done) .hint').length, rHints: document.querySelectorAll('#rGoals .hint').length, undone: document.querySelectorAll('#goals .goal:not(.done)').length, dashed: getComputedStyle(document.querySelector('#goals .goal')).borderTopStyle };
        try{ if (keep !== null) localStorage.setItem('mishin-goals', keep); }catch(e){} KB.renderGoals && KB.renderGoals(); t.hidden = true; document.body.classList.remove('menu'); return o; });
      ok(tt.start && (want === 'noren' ? tt.noren : want === 'talk' ? tt.talkAbove : true), `題（${w}×${h}）で ${want === 'noren' ? '店の のれんと' : want === 'talk' ? 'あいさつと' : ''}「ゲームで遊ぶ」が 1画面目に ゆとりを もって 見える`, tt);
      if (want === 'talk') ok(tt.dashed === 'dashed' && tt.undone === 3 && tt.hints >= 1 && tt.rHints === 0, '題の 目標は 点線の 箱で、ことばの 意味を そえる', tt); }
    await p.setViewportSize({ width:320, height:568 }); await p.waitForTimeout(100);
    const bb = await p.evaluate(() => { document.getElementById('title').hidden = true; KB.start(); const S = KB.S, L = KB.layout(); const b = KB.makeBag(0); Object.assign(b, { face:'back', slide:0 }); S.bag = b; S.msg = { text:'裏ですね。端の 赤い 糸を つまんで ください', kind:'ok', t:0.5, life:2 }; return new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r({ top:S.msgTop, y:S.msgY, seam:L.seamY })))); });
    ok(bb.y + (bb.y - bb.top) + 9 <= bb.seam - 16, '320 幅で 2行の 吹き出しも 縫い目に かからない', bb);
    // 82周目：れんしゅうの 拡大窓は 右手の 親指（下の 角 → 左の 端）で かくれない 所・帯と 音ボタンに かからない
    for (const [w, h] of [[390,844],[360,640],[320,568],[844,390],[568,320]]){ await p.setViewportSize({ width:w, height:h }); await p.waitForTimeout(100);
      const zz = await p.evaluate(async () => { KB.startPractice(); const S = KB.S; S.bag.slide = 0; S.zoom = undefined; for (let i=0; i<40 && !S.zoom; i++) await new Promise(r => setTimeout(r, 50)); /* 拡大窓が かかれる まで 待つ（重い ときに 250ms で 足りない ことが あった。91周目） */ const L = KB.layout(), z = S.zoom, W = KB.size().W, H = KB.size().H;
        const snd = document.getElementById('soundBtn').getBoundingClientRect(), cv = document.getElementById('cv').getBoundingClientRect();
        const t = Math.max(0, Math.min(1, ((z.cx - W) * (L.x0 - W) + (z.cy - H) * (L.seamY - H)) / ((L.x0 - W)**2 + (L.seamY - H)**2))), px = W + t*(L.x0 - W), py = H + t*(L.seamY - H); /* 親指の 線（右下の 角 → 左の 端） */
        return { thumb: Math.hypot(z.cx - px, z.cy - py) - z.r, banner: z.cy - z.r - (S.bannerBottom||0), sound: (snd.top - cv.top) - (z.cy + z.r) > 0 || (snd.left - cv.left) > z.cx + z.r, inside: z.cx - z.r >= 0 && z.cx + z.r <= W && z.cy + z.r <= H }; });
      ok(zz.thumb > 20 && zz.banner >= 0 && zz.sound && zz.inside, `れんしゅうの 拡大窓が 画面の 中・親指・帯・音ボタンに かからない（${w}×${h}）`, zz); }
    // 83周目：れんしゅうの 声は 上の 帯の こめつぶが 言う（袋の 上に 吹き出しを 出さない）
    await p.setViewportSize({ width:390, height:844 }); await p.waitForTimeout(100);
    const pm = await p.evaluate(() => { KB.startPractice(); const S = KB.S; S.bag.slide = 0; S.msgY = undefined; S.msg = { text:'その 調子です', kind:'ok', t:0.1, life:2 }; KB.step(1/60);
      return new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r({ band: document.getElementById('stepNow').textContent, y: S.msgY })))); });
    ok(/その 調子です/.test(pm.band) && pm.y === undefined, 'れんしゅうの 声は 上の 帯に 出て、袋の 上に 吹き出しは 出ない', pm);
    // 91周目：タイムアタック 4袋目からは 表の 端を 1本指で さわっても 表を さわった ことに（声で たしかめる ずるさを ふさぐ）。教える 3袋は 声だけ
    const pf = await p.evaluate(() => { const out = []; for (const k of [1, 3]){ KB.start(); const S = KB.S, L = KB.layout(); const b = KB.makeBag(k); Object.assign(b, { face:'front', slide:0, phase:'look' }); S.bag = b; const f0 = S.fronts, t0 = S.time; KB.tap(L.x0 + 4, L.seamY); out.push({ k, fronts: S.fronts - f0, dt: +(S.time - t0).toFixed(2) }); } return out; });
    ok(pf[0].fronts===0 && pf[1].fronts===1 && pf[1].dt < 0, '表の 端の 1本指タップ：教える 袋は 声だけ、4袋目からは 表を さわった ことに', pf);
    // 99周目（はじめての 30秒）：教える 3袋は 表の 端を つまんでも 声だけ・タイムアタックの はじめに 二本指の 見本・れんしゅうは 1本指の ことば
    const f99 = await p.evaluate(() => { const out = {}; KB.start(); let S = KB.S, L = KB.layout(); out.hint = S.pinchHint; const b = KB.makeBag(1); Object.assign(b, { face:'front', slide:0, phase:'look' }); S.bag = b; const f0 = S.fronts, t0 = S.time; KB.down(L.x0 + 4, L.seamY); KB.up(); out.fronts = S.fronts - f0; out.dt = +(S.time - t0).toFixed(2);
      KB.startPractice(); S = KB.S; L = KB.layout(); Object.assign(S.bag, { slide:0, face:'back' }); KB.tap(KB.size().W/2, L.seamY + 200); out.tapMsg = S.msg && S.msg.text; return out; });
    ok(f99.hint > 0 && f99.fronts === 0 && f99.dt === 0 && /指を 1本/.test(f99.tapMsg || ''), 'はじめての 30秒：二本指の 見本・教える 袋は 声だけ・れんしゅうは 1本指の ことば', f99);
    // 100周目：張りの 目安（こめつぶ）が 出る はじめの 2袋 だけ 吹き出しの 顔を けす（3袋目からは 顔を 出す）
    const g3 = [];
    for (const k of [1, 3]) g3.push(await p.evaluate(k => { KB.start(); const S = KB.S; const b = KB.makeBag(k); Object.assign(b, { face:'back', slide:0, phase:'pull', pulled:4 }); S.bag = b; S.held = true; S.msg = { text:'強すぎます', kind:'ng', t:0.5, life:9 };
      return new Promise(r => requestAnimationFrame(() => { S.held = true; requestAnimationFrame(() => r({ k, face: S.msgFace })); })); }, k));
    ok(g3[0].face === 0 && g3[1].face > 0, '張りの 目安が ある 袋だけ 吹き出しの 顔を けす（3袋目からは 顔を 出す）', g3);
    // 101周目：タイムアタックの 時計は はじめて さわって から
    const ck = await p.evaluate(() => { KB.manual = true; KB.start(); const S = KB.S, L = KB.layout(); for (let i=0;i<120;i++) KB.step(1/60); const t0 = S.time; KB.tap(KB.size().W/2, L.seamY + 200); for (let i=0;i<60;i++) KB.step(1/60); const t1 = S.time; KB.manual = false; return { t0, t1 }; });
    ok(ck.t0 === 30 && ck.t1 < 29.5, 'タイムアタックの 時計は はじめて さわって から へる', ck);
    // 108周目：キーの 人は Esc で タイムアタックを おわれる・「もう一回」の 名前は きまって いる（小さい 字は 読ませない）
    const esc = await p.evaluate(async () => { localStorage.setItem('mishin-best2', '5000'); KB.start(); KB.S.score = 4000; KB.S.bags = 3; document.dispatchEvent(new KeyboardEvent('keydown', { key:'Escape', bubbles:true })); for (let i=0;i<150;i++) KB.step(1/60); await new Promise(r => setTimeout(r, 100));
      const sm = document.querySelector('#againBtn small'); return { res: !document.getElementById('result').hidden, sm: !!sm, smHidden: !!sm && sm.getAttribute('aria-hidden') === 'true' }; });
    ok(esc.res && esc.smHidden, 'キーの 人は Esc で タイムアタックを おわれる・「もう一回」の 小さい 字は 読ませない', esc);
    // 116周目：フィーバーの おわりは 吹き出しを 出さなくても 読み上げる・引いて いる 間の「強すぎます」は よろこびの 声より 先
    const fe = await p.evaluate(async () => { KB.manual = true; KB.start(); const S = KB.S; S.touched = true; S.msg = { text:'一本どり！', kind:'ok', t:0.3, life:1.2 }; S.feverT = 0.01; document.getElementById('sr').textContent = ''; KB.step(1/60); await new Promise(r => setTimeout(r, 300)); const sr = document.getElementById('sr').textContent; KB.manual = false; return { sr, msg: S.msg && S.msg.text }; });
    ok(/フィーバー おわり/.test(fe.sr) && fe.msg === '一本どり！', 'フィーバーの おわりは 吹き出しを 上書き しなくても 読み上げる', fe);
    // 117周目（はじめての タイムアタック）：教える 袋で 縫い始めを つまんでも 声だけ・2本の 指が はなれて いると 声・1本指 2回目は くわしく・0袋の 結果は れんしゅうが 先
    const ta1 = await p.evaluate(async () => { KB.manual = true; KB.start(); const S = KB.S, L = KB.layout(); const b = KB.makeBag(1); Object.assign(b, { face:'back', slide:0, phase:'look', start:'L' }); S.bag = b; const t0 = S.time, w0 = S.wrongs; KB.down(L.x1 - 4, L.seamY); KB.up(); const wrong = { dt: S.time - t0, w: S.wrongs - w0, msg: S.msg && S.msg.text };
      S.msg = null; ev('pointerdown', 31, L.x0, L.seamY); ev('pointerdown', 32, L.x0 + 200, L.seamY); await new Promise(r => setTimeout(r, 700)); const far = S.msg && S.msg.text; ev('pointerup', 31, L.x0, L.seamY); ev('pointerup', 32, L.x0 + 200, L.seamY);
      S.oneTries = 1; S.msg = null; KB.manual = false; return { wrong, far }; });
    ok(ta1.wrong.dt === 0 && ta1.wrong.w === 0 && /縫い始め/.test(ta1.wrong.msg || '') && /はなれて/.test(ta1.far || ''), '教える 袋で 縫い始めを つまんでも 声だけ・2本の 指が はなれて いると 声（117周目）', ta1);
    const z0 = await p.evaluate(async () => { KB.start(); KB.S.time = 0.01; for (let i=0;i<120;i++) KB.step(1/60); await new Promise(r => setTimeout(r, 100)); const ag = document.getElementById('againBtn'); return { next: ag.nextElementSibling && ag.nextElementSibling.id, next2: ag.nextElementSibling && ag.nextElementSibling.nextElementSibling && ag.nextElementSibling.nextElementSibling.id }; });
    ok(z0.next === 'tip' && z0.next2 === 'toPractice', '0袋の 結果は「もう一回」の すぐ 下に ヒントと「れんしゅう」', z0);
    // 118周目：はなれすぎの 声は つまめたら 出さない・れんしゅうでは 出さない。「きつい目が 来ます」で よろこびの 声を 消さない
    const fa = await p.evaluate(async () => { const out = {}; KB.start(); let S = KB.S, L = KB.layout(); Object.assign(S.bag, { face:'back', slide:0, phase:'look' }); S.msg = null;
      ev('pointerdown', 41, L.x0, L.seamY); ev('pointerdown', 42, L.x0 + 160, L.seamY); await new Promise(r => setTimeout(r, 100)); ev('pointermove', 42, L.x0 + 20, L.seamY); await new Promise(r => setTimeout(r, 700)); out.pinched = /はなれて/.test((S.msg && S.msg.text) || ''); ev('pointerup', 41, L.x0, L.seamY); ev('pointerup', 42, L.x0 + 20, L.seamY);
      KB.startPractice(); S = KB.S; L = KB.layout(); S.bag.slide = 0; S.msg = null; ev('pointerdown', 43, L.x0, L.seamY); ev('pointerdown', 44, L.x0, L.seamY + 200); await new Promise(r => setTimeout(r, 700)); out.practice = /はなれて/.test((S.msg && S.msg.text) || ''); ev('pointerup', 43, L.x0, L.seamY); ev('pointerup', 44, L.x0, L.seamY + 200); return out; });
    const fa2 = await p.evaluate(async () => { KB.start(); const S = KB.S, L = KB.layout(); Object.assign(S.bag, { face:'back', slide:0, phase:'look' }); S.msg = null;
      ev('pointerdown', 45, L.x0, L.seamY); ev('pointerdown', 46, L.x0 + 160, L.seamY); await new Promise(r => setTimeout(r, 100)); ev('pointermove', 46, L.x0 + 20, L.seamY); await new Promise(r => setTimeout(r, 100)); ev('pointermove', 46, L.x0 + 300, L.seamY); await new Promise(r => setTimeout(r, 600)); const m = (S.msg && S.msg.text) || ''; ev('pointerup', 45, L.x0, L.seamY); ev('pointerup', 46, L.x0 + 300, L.seamY); return m; });
    ok(!fa.pinched && !fa.practice && !/はなれて/.test(fa2), '「指が はなれています」は つまめたら 出さない（はなして から ひらいても）・れんしゅうでは 出さない（118・123周目）', { fa, fa2 });
    // 123周目：320×568 で もつれた とき 吹き出しの 字を つぶさない
    await p.setViewportSize({ width:320, height:568 }); await p.waitForTimeout(100);
    const tg = await p.evaluate(() => new Promise(res => { KB.start(); const S = KB.S; S.msg = null; Object.assign(S.bag, { face:'back', slide:0, phase:'pull' }); S.bag.tangle = { x: KB.layout().x0 + 60, taps:0, tug:0 }; requestAnimationFrame(() => requestAnimationFrame(() => res({ fs: S.msgFs, fit: S.msgFit })) ); }));
    ok(tg.fs >= 13 && tg.fit, '320×568 で もつれた とき 吹き出しの 字は 13px 以上で 横に つぶさない', tg);
    await p.setViewportSize({ width:390, height:844 }); await p.waitForTimeout(100);
    // 122周目：「もう一回」の 中に 出した 行は 結果の 吹き出しで 見た目に くりかえさない（読み上げには のこす）
    const dup = await p.evaluate(async () => { localStorage.setItem('mishin-best2', '5000'); KB.start(); const S = KB.S; S.score = 4000; S.bags = 3; S.time = 0.01; for (let i=0;i<120;i++) KB.step(1/60); await new Promise(r => setTimeout(r, 100)); const b = document.getElementById('best'), c = b.cloneNode(true); c.querySelectorAll('.sr').forEach(e => e.remove()); return { vis: c.textContent, all: b.textContent }; });
    ok(!/じこベストまで/.test(dup.vis) && /じこベストまで/.test(dup.all), '「もう一回」の 中に 出した 行は 結果の 吹き出しで くりかえさない（読み上げには のこす）', dup);
    // 105周目：まだの 目標が あと 1つ なら ヒントで つなげる
    const near = await p.evaluate(() => { localStorage.removeItem('mishin-goals'); KB.start(); const S = KB.S; S.bags = 7; S.clean = 7; S.bestStreak = 4; S.quick = 7; S.fevers = 2; S.goldenClean = 1; S.pullTime = 30; S.zoneTime = 25; S.score = 6000; S.time = 0.01; for (let i=0;i<120;i++) KB.step(1/60); return document.getElementById('tip').textContent; });
    ok(/あと 1つで きょうの 目標/.test(near), '目標が あと 1つの ときは ヒントで「あと 1つで きょうの 目標」', near);
    const idle = await p.evaluate(() => { KB.manual = true; KB.start(); const S = KB.S; for (let i=0;i<60*10;i++) KB.step(1/60); const t = S.time; KB.manual = false; return t; });
    ok(idle < 29, 'さわらなくても 8秒 たつと 時計が 動く（キーの 人・放って おいた 人が おわれる）', idle);
    await p.setViewportSize({ width:320, height:568 }); await p.waitForTimeout(100);
    const a320 = await p.evaluate(async () => { localStorage.setItem('mishin-best2', '5000'); KB.start(); const S = KB.S; S.score = 4000; S.bags = 3; S.time = 0.01; for (let i=0;i<120;i++) KB.step(1/60); await new Promise(r => setTimeout(r, 400)); const r = document.getElementById('againBtn').getBoundingClientRect(); return { b: Math.round(r.bottom), h: Math.round(r.height), H: innerHeight, t: document.getElementById('againBtn').textContent }; });
    ok(a320.b <= a320.H && /あと/.test(a320.t), '320×568 で「もう一回（じこベストまで あと…）」が 画面の 中', a320);
    await p.setViewportSize({ width:390, height:844 }); await p.waitForTimeout(100);
    // 92周目：端の 近くでも 縫い目から はなれた 1本指タップは ふつうに 袋を まわす（罰に しない）
    await p.setViewportSize({ width:844, height:390 }); await p.waitForTimeout(100);
    const pr2 = await p.evaluate(() => { KB.start(); const S = KB.S, L = KB.layout(); const b = KB.makeBag(4); Object.assign(b, { face:'front', slide:0, phase:'look' }); S.bag = b; const f0 = S.fronts; KB.tap(L.x0 + 50, L.seamY + 45); return { fronts: S.fronts - f0, flip: b.flipT > 0 }; });
    ok(pr2.fronts===0 && pr2.flip, '表の 袋の 端の 近くでも 縫い目から はなれた タップは まわす（罰なし）', pr2);
    await p.setViewportSize({ width:390, height:844 }); await p.waitForTimeout(100);
    // 84周目（見えにくさ 5）：あいた 袋は「白糸は 自然に ぬけます」も 言う・まとめと 結果では キャンバスを 読まない・字 200%（幅 195）
    const dn = await p.evaluate(() => { KB.startPractice(); const S = KB.S; S.bag.slide = 0; KB.step(1/60); S.bag.phase = 'pull'; S.bag.done = true; S.bag.open = 0; S.msg = { text:'きれいに あきました！', kind:'ok', t:0.1, life:2 }; KB.step(1/60); return new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r(document.getElementById('stepNow').textContent)))); });
    ok(/^きれいに あきました！ 赤が/.test(dn) && (dn.match(/あきました/g)||[]).length === 1 && /白糸は 自然に ぬけます/.test(dn), 'れんしゅうの あいた 袋で「白糸は 自然に ぬけます」も 帯に 出る', dn);
    const dn2 = await p.evaluate(() => { KB.startPractice(); const S = KB.S; S.bag.slide = 0; KB.step(1/60); S.bag.phase = 'pull'; S.bag.done = true; S.bag.open = 0; S.msg = { text:'あきました！', kind:'ok', t:0.1, life:2 }; KB.step(1/60); return new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r(document.getElementById('stepNow').textContent)))); });
    ok(/白糸は 自然に ぬけます/.test(dn2), '一本どりで ない ときも「白糸は 自然に ぬけます」が 帯に 出る', dn2);
    // 93周目（お客さん目線 4）：下へ 引くと「横へ」、とちゅうで はなすと「また 指を」、やめて 見に 来た 人には 手順を LINE より 先に
    const bandAt = (setup) => p.evaluate(setup).then(() => p.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r(document.getElementById('stepNow').textContent))))));
    const side = await bandAt(() => { KB.startPractice(); const S = KB.S; S.bag.slide = 0; S.bag.face = 'back'; S.bag.phase = 'pull'; S.bag.pulled = 2; S.msg = null; S.held = true; S.dirEff = 0.2; KB.step(1/60); S.held = true; S.dirEff = 0.2; });
    const rel = await bandAt(() => { const S = KB.S; S.held = false; S.dirEff = 1; S.liftT = 1; S.msg = null; });
    ok(/下では なく/.test(side) && /また 指を おいて/.test(rel), 'れんしゅう：下へ 引くと「横へ」、とちゅうで はなすと「また 指を おいて」', { side, rel });
    const sk = await p.evaluate(() => { KB.startPractice(); KB.step(1/60); document.getElementById('skipBtn') && document.getElementById('skipBtn').click(); const c = document.getElementById('coinDone'); if (c.hidden) return { hidden:true };
      const t = c.querySelector('.talks').getBoundingClientRect().top, l = c.querySelector('.line-talk').getBoundingClientRect().top; c.hidden = true; return { talks:t, line:l }; });
    ok(sk.talks < sk.line, '「やめて 手順を 見る」で 来た ときは 手順が LINE より 先', sk);
    // 96周目（見えにくさ 6）：つまみなおす たびに 帯の 文を かえない・見た目と DOM の 順を そろえる
    const churn = await p.evaluate(async () => { KB.startPractice(); const S = KB.S; Object.assign(S.bag, { slide:0, face:'back', phase:'pull', pulled:2 }); S.msg = null; const out = [];
      for (const st of [{ held:true, dirEff:0.2, liftT:0 }, { held:false, dirEff:0.2, liftT:0.3 }, { held:true, dirEff:0.6, liftT:0 }, { held:false, dirEff:0.6, liftT:0.3 }, { held:true, dirEff:0.3, liftT:0 }]){
        Object.assign(S, st); await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); Object.assign(S, st); out.push(document.getElementById('stepNow').textContent.slice(0, 8)); }
      return { n: new Set(out).size, out, live: document.getElementById('stepNow').getAttribute('aria-live') }; });
    ok(churn.n === 1 && !churn.live, '下へ 引いて つまみなおしても 帯の 文は かわらない（aria-live なし・読み上げは 袋ごとに 1回）', churn);
    const dom = await p.evaluate(() => { const g = document.getElementById('againBtn'), l = g.nextElementSibling, b = l && l.nextElementSibling; return { line: l && l.classList.contains('line-talk'), best: b && b.id, first: l && l.querySelector('.say').firstElementChild.tagName }; });
    ok(dom.line && dom.best === 'bestTalk' && dom.first === 'A', '結果の DOM の 順＝見た目の 順（もう一回 → LINE（ボタン → 文）→ じこベストの 声）', dom);
    const skd = await p.evaluate(() => { KB.startPractice(); KB.step(1/60); const c = document.getElementById('coinDone'), sb = document.getElementById('skipBtn'); if (sb) sb.click(); const t = c.querySelector('.talks'), l = c.querySelector('.line-talk'); const r = !!(t.compareDocumentPosition(l) & Node.DOCUMENT_POSITION_FOLLOWING); c.hidden = true; return r; });
    ok(skd, '「やめて 手順を 見る」の まとめは DOM でも 手順 → LINE', skd);
    const sk2 = await p.evaluate(() => { KB.startPractice(); KB.step(1/60); const sb = document.getElementById('skipBtn'); if (sb) sb.click(); const c = document.getElementById('coinDone'), t = c.querySelector('.talks'), st = t.nextElementSibling, l = st && st.nextElementSibling, says = [...t.querySelectorAll('.say')].map(e => e.textContent); c.hidden = true;
      return { stuck: st && st.id, line: !!l && l.classList.contains('line-talk'), s4: /もつれ/.test(says[3] || ''), s5: /ごみ箱/.test(says[4] || '') }; });
    ok(sk2.stuck === 'stuck' && sk2.line && sk2.s4 && sk2.s5, 'やめて 見に 来た まとめは 手順 →「それでも 取れない ときは」→ LINE、手順4 は もつれ・5 は ごみ箱（111・113周目）', sk2);
    // 97周目：横向きで やめて 見に 来ても 袋の 両はしは 左の 列の 上・せまい 画面でも 手順の 番号を けさない
    for (const [w, h] of [[667,375],[195,422]]){ await p.setViewportSize({ width:w, height:h }); await p.waitForTimeout(100);
      const ls = await p.evaluate(async () => { KB.startPractice(); KB.step(1/60); await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); document.getElementById('skipBtn').click(); await new Promise(r => setTimeout(r, 100));
        const c = document.getElementById('coinDone'), e = c.querySelector('.ends').getBoundingClientRect(), n = [...c.querySelectorAll('.who.num')].filter(x => getComputedStyle(x).display !== 'none').length; c.hidden = true; return { endsTop: Math.round(e.top), H: innerHeight, nums: n }; });
      ok(ls.endsTop < ls.H && ls.nums === 5, `やめて 見に 来た まとめで 袋の 両はしが 1画面目・手順の 番号 5つ（${w}×${h}）`, ls); }
    await p.setViewportSize({ width:390, height:844 }); await p.waitForTimeout(100);
    const ah = await p.evaluate(() => { KB.start(); const S = KB.S; S.time = 0.01; for (let i=0;i<120;i++) KB.step(1/60); return new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r({ res: !document.getElementById('result').hidden, cv: document.getElementById('cv').getAttribute('aria-hidden') })))); });
    ok(ah.res && ah.cv === 'true', '結果の 間は キャンバス（前の 袋の 文）を 読み上げない', ah);
    await p.setViewportSize({ width:195, height:422 }); await p.waitForTimeout(100);
    const z2 = await p.evaluate(() => { const r = [...document.querySelectorAll('#result .talk>.say')].map(e => e.getBoundingClientRect().right), hs = document.querySelector('#result h1 small'); return { right: Math.max(...r), W: innerWidth, hsOver: hs.scrollWidth - hs.clientWidth }; });
    ok(z2.right <= z2.W + 1 && z2.hsOver <= 1, '幅 195（字 200% の かわり）で 結果の 吹き出しも 見出しの 小さい 字も はみ出さない', z2);
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
      for (const d of ['2026-10-28', '2027-03-10', '2026-08-25']) { KB.today = d; const bag = KB.makeBag(4), bag9 = KB.makeBag(9); out[d] = { year: KB.riceYear(new Date(d)), golden: bag.golden, brand: bag.brand, brand9: bag9.golden ? bag9.brand : '', kaori: KB.riceYear(new Date(d), 'あいちのかおり') }; }
      KB.today = null; return out; });
    // 135周目：きょうの 目標は 1年 どの 日も 3つ ちがう・1つは はじめての 人にも とれる（8袋 あける か 右から ほどく袋）・新米の 目標は 新米の きせつ だけ
    const yg = await p.evaluate(() => { const bad = [], cnt = {}, first = {}; let n = 0; for (let t = Date.UTC(2026,0,1); t < Date.UTC(2027,0,1); t += 864e5){ const d = new Date(t).toISOString().slice(0,10); KB.today = d; const ids = KB.todayGoals(); n++;
        if (new Set(ids).size !== 3 || !ids.some(i => i==='bags8' || i==='right')) bad.push(d + ':' + ids.join(',')); first[ids[0]] = (first[ids[0]]||0) + 1; for (const i of ids) cnt[i] = (cnt[i]||0) + 1; }
      let same = 0, days = 0, prev = null; for (let t = Date.UTC(2026,0,1); t < Date.UTC(2031,0,1); t += 864e5){ KB.today = new Date(t).toISOString().slice(0,10); const e = KB.todayGoals()[0]; if (prev) { days++; if (e === prev) same++; } prev = e; } /* 141周目：となりの 日で やさしい 目標が 同じに なる 割合（でたらめなら 0.5） */
      KB.today = null; return { n, bad: bad.slice(0,5), nbad: bad.length, first, cnt, sameNext: +(same/days).toFixed(3) }; });
    const others = Object.entries(yg.cnt).filter(([k]) => !['bags8','right','golden'].includes(k)).map(([, v]) => v); /* 136周目：日ごとに ちらばる（かけ算の けた落ちで いつも 同じ 目標に なって いた） */
    ok(yg.n === 365 && yg.nbad === 0 && yg.sameNext < 0.57 && yg.first.bags8 > 100 && yg.first.right > 100 && others.length === 6 && Math.min(...others) > 40 && Math.max(...others) < 160, 'きょうの 目標は どの 日も 3つ ちがい、1つは はじめての 人にも とれる・日ごとに ちらばる', yg);
    ok(r['2026-10-28'].golden && r['2026-10-28'].year===2026, '秋は その年が 産年で 新米シール', r['2026-10-28']);
    ok(r['2026-08-25'].golden && r['2026-08-25'].brand!=='あいちのかおり' && r['2026-08-25'].brand9!=='あいちのかおり' && r['2026-08-25'].kaori===2025, '8月下旬は あいちのかおりの 新米は まだ ない（10月中旬から）', r['2026-08-25']);
    ok(!r['2027-03-10'].golden && r['2027-03-10'].year===2026, '春は 前の 年が 産年で 新米シールなし', r['2027-03-10']);
  },
  // フォントは 使う 字だけ（tools/mishin/fonts.py）。字を 書き足したら 回す
  async fonts(){
    const r = require('child_process').spawnSync('python3', [path.resolve(__dirname, 'fonts.py'), '--check'], { cwd: path.resolve(__dirname, '../..'), encoding:'utf-8' });
    ok(r.status===0, 'フォントの 字に もれが ない', (r.stdout||'') + (r.stderr||''));
  },
  // 146周目：見出しの 字（Google Fonts）が とどかない ときは かわりの 字を 太く。とどいたら 太字を やめる
  async nofont(b){
    const ctx = await b.newContext({ viewport:{ width:360, height:560 } }); await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
    const p = await ctx.newPage(); await p.goto(FILE); await p.waitForTimeout(1200);
    const nf = await p.evaluate(() => ({ cls: document.documentElement.classList.contains('nofont'), h1: getComputedStyle(document.querySelector('#title h1')).fontWeight, btn: getComputedStyle(document.getElementById('practiceBtn')).fontWeight, start: Math.round(document.getElementById('startBtn').getBoundingClientRect().bottom), H: innerHeight, synth: getComputedStyle(document.querySelector('#title h1')).fontSynthesis }));
    await ctx.close();
    ok(nf.cls && +nf.h1 >= 700 && +nf.btn >= 700 && nf.start <= nf.H, '字が とどかない ときは 見出しと ボタンを 太い かわりの 字で・ボタンは 1画面目', nf);
    // 147周目：字が とどいたら 太字を やめる（この 環境で Google Fonts に つながる とき だけ 見る）・とどく 前も にせの 太字に しない
    const p2 = await page(b, 360, 560, ''); const on = await p2.evaluate(async () => { for (let i = 0; i < 60; i++){ if ([...document.fonts].some(f => /Dela Gothic One/.test(f.family) && f.status === 'loaded')) break; await new Promise(r => setTimeout(r, 100)); }
      const loaded = [...document.fonts].some(f => /Dela Gothic One/.test(f.family) && f.status === 'loaded'); await new Promise(r => setTimeout(r, 100)); return { loaded, cls: document.documentElement.classList.contains('nofont'), synth: getComputedStyle(document.querySelector('#title h1')).fontSynthesis }; });
    if (on.loaded) ok(!on.cls, '字が とどいたら 太字を やめる', on); else console.log('  （Google Fonts に つながらない ので「とどいたら やめる」は 見ない）');
    ok(/none/.test(nf.synth || 'none'), '太字の 間も にせの 太字に しない', nf);
  },
  async sound(b){
    const p = await page(b, 390, 844, '');
    const a = await p.textContent('#soundBtn'); await p.click('#soundBtn'); const c = await p.textContent('#soundBtn');
    await p.reload(); await p.waitForTimeout(200); const d = await p.textContent('#soundBtn');
    ok(a.includes('あり') && c.includes('なし') && d.includes('なし'), '音・ふるえの 切りかえを おぼえる', { a, c, d });
    // 139周目：遊ぶ 間は「音 なし／あり」だけ（袋の 右下に かかる ところを へらす）。メニューでは「音・ふるえ」。読み上げの 名前は かわらない
    const sw = await p.evaluate(async () => { const B = document.getElementById('soundBtn'), menu = { w: B.getBoundingClientRect().width, t: B.innerText };
      document.getElementById('title').hidden = true; KB.start(); await new Promise(r => setTimeout(r, 200)); const play = { w: B.getBoundingClientRect().width, t: B.innerText, label: B.getAttribute('aria-label') };
      return { menu, play }; });
    ok(/ふるえ/.test(sw.menu.t) && sw.play.t.replace(/\s+/g,' ').trim() === '音 なし' && sw.play.w <= 100 && sw.play.label === '音・ふるえ', '遊ぶ 間の 音ボタンは みじかく（袋に かかる ところを へらす）', sw);
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
    // 94周目：HUD の 字は かわった ときだけ 書く（毎コマ 書くと そのたびに 画面の 組みなおし）
    const mu = await p.evaluate(async () => { KB.up(); KB.manual = true; KB.start(); const S = KB.S; S.bag.slide = 0; await new Promise(r => setTimeout(r, 300)); let n = 0;
      const mo = new MutationObserver(ms => { n += ms.length; }); for (const id of ['score','time','bags','combo','timeDelta']) mo.observe(document.getElementById(id), { childList:true, characterData:true, subtree:true, attributes:true });
      for (let i=0;i<20;i++) await new Promise(r => requestAnimationFrame(r)); mo.disconnect(); KB.manual = false; return n; });
    ok(mu === 0, 'うごかない 間は HUD の 字を 書きなおさない', mu);
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
