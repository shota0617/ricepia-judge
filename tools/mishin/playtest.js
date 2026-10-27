// ミシン糸 一本どり：ボットで通しプレイして、面白さの目安を数える
// node tools/mishin/playtest.js [--runs 20] [--shot]
const { chromium } = require('playwright');
const path = require('path');
const args = process.argv.slice(2);
const RUNS = +(args[args.indexOf('--runs')+1] || 20) || 20;
const SHOT = args.includes('--shot');
const FILE = 'file://' + path.resolve(__dirname, '../../mishin.html');

// ボットの性格：read＝くさり目を読みあてる確率、target＝ねらう張り、noise＝ぶれ、look＝かたい目を何目前から読むか、react＝気づくまでの秒
// bell＝指の速さが 1回の なで の 中で 山なりに なる（人の 指に 近い）
const BOTS = {
  expert:  { read:1.00, target:0.80, noise:0.06, look:1, react:0.15 },
  human:   { read:0.92, target:0.65, noise:0.15, look:0, react:0.25, bell:true, stroke:200 },
  regular: { read:0.90, target:0.80, noise:0.18, look:0, react:0.25 },
  novice:  { read:0.70, target:0.90, noise:0.30, look:0, react:0.40, bell:true },
  greedy:  { read:1.00, target:1.35, noise:0.10, look:0, react:0.40 },
  careful: { read:1.00, target:0.22, noise:0.05, look:1, react:0.05 },
  guesser: { read:0.50, target:0.80, noise:0.06, look:1, react:0.15 },
};

async function main(){
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport:{ width:390, height:844 }, deviceScaleFactor:1 });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(FILE);
  await page.waitForFunction(() => window.KB);
  const out = {};
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
        let x = W/2, y = H*0.6, dirx = 1, strokeLeft = 0, lift = 0, held = false, noise = 1, noiseT = 0;
        let decidedFor = null, knotSeenAt = -1, bagStart = 0; const bagTimes = [];
        let lastBags = 0;
        while (S.mode === 'play' && t < 600){
          const b = S.bag;
          if (S.bags !== lastBags){ bagTimes.push(t - bagStart); bagStart = t; lastBags = S.bags; }
          if (b.done || b.slide > 0.05 || S.stunT > 0){ if (held){ KB.up(); held=false; } KB.step(dt); t+=dt; continue; }
          if (!b.engaged){
            if (decidedFor !== b){ decidedFor = b; b._pick = rand() < bot.read ? b.side : (b.side==='L'?'R':'L'); b._think = 0.35 + rand()*0.3; }
            if (b._think > 0){ b._think -= dt; KB.step(dt); t+=dt; continue; }
            if (b.wrong && b._pick !== b.side) b._pick = b.side; // 逆を引いて結び目 → 反対へ
            if (!held){ x = b._pick==='L' ? W*0.25 : W*0.75; y = H*0.6; KB.down(x,y); held = true; strokeLeft = (bot.stroke||280); }
          }
          // ねらう速さ
          noiseT -= dt; if (noiseT <= 0){ noise = 1 + (rand()*2-1)*bot.noise; noiseT = 0.15; }
          let tgt = bot.target * noise;
          // かたい目
          let d = 99; for (const k of b.knots) if (k >= b.pulled) d = Math.min(d, k - b.pulled);
          const onKnot = d === 0;
          if (onKnot){ if (knotSeenAt < 0) knotSeenAt = t; } else knotSeenAt = -1;
          const slowNow = (d <= bot.look && d > 0 && b.sub > 0.6*KB.R.pxPerStitch) || (onKnot && t - knotSeenAt >= bot.react);
          const safe = b.safe * (slowNow ? KB.R.knotSlow : 1);
          const v = tgt * safe; // px/s
          if (lift > 0){ lift -= dt; if (lift <= 0){ KB.down(x,y); held = true; strokeLeft = (bot.stroke||280); } KB.step(dt); t+=dt; continue; }
          if (!held){ KB.down(x,y); held = true; strokeLeft = (bot.stroke||280); }
          const ph = 1 - Math.max(0,strokeLeft)/(bot.stroke||280);
          const mv = (bot.bell ? v*1.5*Math.max(0.15, Math.sin(Math.PI*ph)) : v)*dt; x += dirx*mv; strokeLeft -= mv;
          KB.move(x, y);
          if (strokeLeft <= 0){ KB.up(); held = false; lift = 0.12; dirx = -dirx; }
          KB.step(dt); t += dt;
        }
        const avg = bagTimes.length ? bagTimes.reduce((a,c)=>a+c,0)/bagTimes.length : 0;
        return { score:S.score, bags:S.bags, clean:S.clean, snaps:S.snaps, wrongs:S.wrongs, len:+t.toFixed(1), perBag:+avg.toFixed(2), zone:+(S.zoneTime/Math.max(0.01,S.pullTime)).toFixed(2) };
      }, [bot, 1000 + r]));
    }
    const mean = k => +(runs.reduce((a,c)=>a+c[k],0)/runs.length).toFixed(2);
    out[name] = { score:mean('score'), bags:mean('bags'), clean:mean('clean'), snaps:mean('snaps'), wrongs:mean('wrongs'), len:mean('len'), perBag:mean('perBag'), zone:mean('zone'), maxBags: Math.max(...runs.map(r=>r.bags)) };
  }
  console.table(out);
  if (errors.length) console.log('ERRORS', errors);
  if (SHOT){
    const dir = process.env.SHOT_DIR || '.';
    const p2 = await browser.newPage({ viewport:{ width:390, height:844 } });
    await p2.goto(FILE); await p2.waitForTimeout(800);
    await p2.screenshot({ path: path.join(dir,'shot-title.png') });
    await p2.evaluate(() => { KB.manual = true; KB.fixedSeed = 1005; KB.start(); for (let i=0;i<30;i++) KB.step(1/60); });
    // 何袋かすすめて、引いている途中で止める
    await p2.evaluate(() => { const S=KB.S; S.bags=6; S.bag = null; });
    await p2.evaluate(() => { KB.S.bag = null; }).catch(()=>{});
    await p2.evaluate(() => { KB.start(); KB.S.bags = 0; for (let i=0;i<40;i++) KB.step(1/60); const {W,H}=KB.size(); const b=KB.S.bag; const x = b.side==='L'?W*0.25:W*0.75; KB.down(x,H*0.6); let xx=x; for (let i=0;i<30;i++){ xx+= (b.side==='L'?-1:1)*10; KB.move(xx, H*0.62); KB.step(1/60);} });
    await p2.waitForTimeout(100);
    await p2.screenshot({ path: path.join(dir,'shot-pull.png') });
    await p2.evaluate(() => { for (let i=0;i<200;i++){ KB.move(200+Math.random()*3000, 600); KB.step(1/60);} });
    await p2.waitForTimeout(100);
    await p2.screenshot({ path: path.join(dir,'shot-snap.png') });
    await p2.evaluate(() => { KB.S.time = 0.01; KB.step(1/60); });
    await p2.waitForTimeout(100);
    await p2.screenshot({ path: path.join(dir,'shot-result.png') });
  }
  await browser.close();
}
main().catch(e => { console.error(e); process.exit(1); });
