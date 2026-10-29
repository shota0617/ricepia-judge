// ミシン糸 一本どり：ボットで通しプレイして、面白さの目安を数える
// node tools/mishin/playtest.js [--runs 12]
// 本物の手順：表なら裏返す（タップ）→ 裏の ほどき始めの端（赤が白い輪にささっている）を 二本指で つまむ → 縫った向きと逆へ ゆっくり引く
// KB.down/move/up は「つまむ手」（2本の指の まん中）、KB.tap は 1本指の タップ
const { chromium } = require('playwright');
const path = require('path');
const args = process.argv.slice(2);
const RUNS = +(args[args.indexOf('--runs')+1] || 12) || 12;
const VW = args.includes('--w') ? +args[args.indexOf('--w')+1] : 390, VH = args.includes('--h') ? +args[args.indexOf('--h')+1] : 844; // 画面の 大きさ（72周目：幅で むずかしさが かわらないか）
const FILE = 'file://' + (process.env.MISHIN_FILE || path.resolve(__dirname, '../../mishin.html')); // MISHIN_FILE で 前の 版と くらべられる（114周目）

// face＝表裏を 見分ける確率、read＝ほどき始めを 読みあてる確率、target＝ねらう張り、noise＝ぶれ、react＝ひっかかりに 気づくまで、
// bell＝なでる速さが 山なり（人の指）、stroke＝1回の なでる長さ
const BOTS = {
  expert:  { face:1.00, read:1.00, target:0.80, noise:0.06, react:0.15, stroke:260 },
  human:   { face:0.95, read:0.90, target:0.65, noise:0.15, react:0.25, bell:true, stroke:200 },
  regular: { face:0.95, read:0.90, target:0.80, noise:0.18, react:0.25, stroke:240 },
  novice:  { face:0.80, read:0.70, target:0.90, noise:0.30, react:0.40, bell:true, stroke:180 },
  greedy:  { face:1.00, read:1.00, target:1.35, noise:0.10, react:0.40, stroke:260 },
  careful: { face:1.00, read:1.00, target:0.22, noise:0.05, react:0.05, stroke:260 },
  guesser: { face:0.50, read:0.50, target:0.80, noise:0.06, react:0.15, stroke:260 },
  // ずるい 打ち方（38周目）：human より 点が 低い ことを 見はる
  flick:   { face:1.00, read:1.00, flick:{ px:60, gap:0.14 }, stroke:9999, react:0, tug:true }, // 小さく すばやく はじく 連打
  alwaysL: { face:0.95, read:0.90, target:0.65, noise:0.15, react:0.25, bell:true, stroke:200, alwaysL:true }, // 端を 読まず いつも 左（human と 同じ 手）
  noKnot:  { face:1.00, read:1.00, target:0.80, noise:0.06, react:99, stroke:260, tug:true }, // きつい目でも ゆるめない
  noKnotH: { face:0.95, read:0.90, target:0.65, noise:0.15, react:99, bell:true, stroke:200, tug:true }, // human と 同じ 手で きつい目を 気に しない（73周目）
  probe:   { face:0.95, read:0.90, target:0.65, noise:0.15, react:0.25, bell:true, stroke:200, probe:true }, // 表裏を 見ずに 端を 1本指で ちょんと さわって 声で たしかめる（91周目）
  // ていねいに 読む 人（91周目）：表裏・端を まちがえないが 1袋で 1秒ほど 長く 見る。alwaysL（読まない）より 低く ならない こと
  slowRead:{ face:1.00, read:1.00, target:0.65, noise:0.15, react:0.25, bell:true, stroke:200, think:1.4 },
};
const CHEATS = ['flick', 'alwaysL', 'noKnot', 'noKnotH', 'probe'];

async function main(){
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport:{ width:VW, height:VH }, deviceScaleFactor:1 });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(FILE);
  await page.waitForFunction(() => window.KB);
  await page.evaluate(() => { window.KB.today = '2026-10-28'; }); // 新米の きせつ（新米の 袋が 出る 日）で はかる。日に よって 数が かわらない ように
  const out = {}, goalTable = {};
  for (const [name, bot] of Object.entries(BOTS)){
    const runs = [];
    for (let r=0; r<RUNS; r++){
      runs.push(await page.evaluate(([bot, seed]) => {
        const KB = window.KB, S = KB.S;
        KB.manual = true; KB.fixedSeed = seed;
        let rs = seed*7+3; const rand = () => { rs = (rs*1103515245+12345) & 0x7fffffff; return rs/0x7fffffff; };
        KB.start();
        const {W,H} = KB.size();
        const dt = 1/60; let t = 0;
        const tick = () => { KB.step(dt); t += dt; };
        let x = 0, y = H*0.6, x0 = 0, strokeLeft = 0, lift = 0, held = false, noise = 1, noiseT = 0;
        let seen = null, knotSeenAt = -1, tangleWait = 0, flickT = 0;
        while (S.mode === 'play' && t < 600){
          const b = S.bag, L = KB.layout();
          if (b.done || b.slide > 0.05 || b.flipT > 0){ if (held){ KB.up(); held=false; } tick(); continue; }
          if (b.phase === 'look'){
            if (seen !== b){ seen = b; b._think = (bot.think || 0.4) + rand()*0.3; b._faceOk = rand() < bot.face; b._readOk = rand() < bot.read; }
            if (b._think > 0){ b._think -= dt; tick(); continue; }
            const isFront = b.face === 'front';
            if (bot.probe && !b._probed){ b._probed = true; KB.tap(L.x0 + 4, L.seamY); b._probeFront = !!(S.msg && /表/.test(S.msg.text)); b._think = 0.15; tick(); continue; }
            const thinksFront = bot.probe ? b._probeFront : b._faceOk ? isFront : !isFront;
            if (thinksFront && !b._flippedOnce){ b._flippedOnce = true; KB.tap(W/2, L.seamY + L.bagH*0.6); b._think = 0.25; tick(); continue; }
            if (isFront){ // 表のまま 端を さわって しまった → 気づいて 裏返す
              KB.down(L.x0 + 4, L.seamY); KB.up(); b._faceOk = true; b._flippedOnce = false; b._think = 0.3; tick(); continue;
            }
            let end = bot.alwaysL ? 'L' : b._readOk ? b.start : (b.start==='L'?'R':'L');
            if (b.wrong && b.wrongEnd) end = b.wrongEnd==='L' ? 'R' : 'L';
            x = end==='L' ? L.x0 + 4 : L.x1 - 4; y = L.seamY + 40;
            KB.down(x, y); held = S.held;
            if (!held){ b._think = 0.3; tick(); continue; }
            x0 = x; strokeLeft = bot.stroke; tick(); continue;
          }
          // 赤の 端を 白い 輪から はずす（少し 引く）
          if (b.phase === 'free'){
            if (!S.held){ KB.down(x, y); held = S.held; }
            const sp = 120; x += KB.pullDir(b)*sp*dt; y += sp*0.3*dt; KB.move(x, y);
            tick(); if (b.phase === 'pull'){ x0 = x; strokeLeft = bot.stroke; } continue;
          }
          // もつれ：気づいて タップ 3回
          if (b.tangle){
            if (bot.tug){ // 表側の 白糸を つまんで 引く
              const st = (L.x1-L.x0)/b.N, sd = KB.pullDir(b), tx = (b.from==='R' ? L.x1 + st*0.1 : L.x0 - st*0.1) + sd*22, ty = L.seamY + 36;
              if (held){ KB.up(); held = false; tick(); continue; }
              KB.down(tx, ty); KB.move(tx + sd*16, ty); tick(); KB.move(tx + sd*32, ty); tick(); KB.up(); tick(); x = tx; y = ty; continue;
            }
            if (held){ KB.up(); held=false; }
            tangleWait -= dt; if (tangleWait <= 0){ KB.tap(W/2, H*0.6); tangleWait = 0.15; }
            tick(); continue;
          }
          const dir = KB.pullDir(b);
          if (bot.flick){ // 小さく すばやく はじく
            if (!held){ KB.down(x, y); held = true; }
            flickT -= dt; if (flickT <= 0){ x += dir*bot.flick.px; flickT = bot.flick.gap; KB.move(x, y); }
            if (x < 24 || x > W-24){ KB.up(); held = false; x = dir>0 ? 40 : W-40; for (let i=0;i<18;i++) tick(); continue; }
            tick(); continue;
          }
          noiseT -= dt; if (noiseT <= 0){ noise = 1 + (rand()*2-1)*bot.noise; noiseT = 0.15; }
          const onKnot = b.knots.has(b.pulled);
          if (onKnot){ if (knotSeenAt < 0) knotSeenAt = t; } else knotSeenAt = -1;
          const slowNow = onKnot && t - knotSeenAt >= bot.react;
          const v = bot.target * noise * b.safe * (slowNow ? KB.R.knotSlow : 1);
          if (lift > 0){ lift -= dt; if (lift <= 0){ KB.down(x,y); held = true; strokeLeft = bot.stroke; } tick(); continue; }
          if (!held){ KB.down(x,y); held = true; strokeLeft = bot.stroke; }
          const ph = 1 - Math.max(0,strokeLeft)/bot.stroke;
          const mv = (bot.bell ? v*1.5*Math.max(0.15, Math.sin(Math.PI*ph)) : v)*dt;
          x += dir*mv; strokeLeft -= mv;
          KB.move(x, y);
          // 画面の 端まで 来たか、1回 ぶん 引いたら、指を はなして つまみなおす（人は 0.3 秒 ほど かかる）
          if (strokeLeft <= 0 || x < 24 || x > W-24){ KB.up(); held = false; lift = 0.3; x = dir>0 ? Math.max(24, x - bot.stroke) : Math.min(W-24, x + bot.stroke); KB.move(x,y); }
          tick();
        }
        const goals = {}; for (const g of KB.GOALS) goals[g.id] = g.ok() ? 1 : 0;
        return { goals, score:S.score, bags:S.bags, clean:S.clean, tangles:S.tangles, wrongs:S.wrongs+S.fronts, len:+t.toFixed(1), zone:+(S.zoneTime/Math.max(0.01,S.pullTime)).toFixed(2), fevers:S.fevers };
      }, [bot, 1000 + r]));
    }
    const mean = k => +(runs.reduce((a,c)=>a+c[k],0)/runs.length).toFixed(2);
    const gl = {}; for (const r of runs) for (const k in r.goals) gl[k] = (gl[k]||0) + r.goals[k]/runs.length;
    goalTable[name] = Object.fromEntries(Object.entries(gl).map(([k,v])=>[k, Math.round(v*100)+'%']));
    out[name] = { score:Math.round(mean('score')), bags:mean('bags'), clean:mean('clean'), tangles:mean('tangles'), wrongs:mean('wrongs'), len:mean('len'), zone:mean('zone'), fevers:mean('fevers'), maxBags: Math.max(...runs.map(r=>r.bags)) };
  }
  console.table(out);
  const bad = CHEATS.filter(c => out[c] && out.human && out[c].score >= out.human.score);
  if (out.slowRead && out.alwaysL && out.slowRead.score < out.alwaysL.score) bad.push('slowRead（ていねいに 読む 人）が alwaysL（読まない）より 低い');
  console.log(bad.length ? '✖ ずるい 打ち方が human 以上：' + bad.join('・') : '✔ ずるい 打ち方（' + CHEATS.join('・') + '）は どれも human より 低い');
  if (args.includes('--goals')) { console.log('きょうの目標が できた 割合'); console.table(goalTable); }
  if (errors.length) console.log('ERRORS', errors);
  await browser.close();
}
main().catch(e => { console.error(e); process.exit(1); });
