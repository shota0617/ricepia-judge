// 米作り365：遊び方の ちがう ボットで 1年を 通して、結果の 差を 表に する
//   node tools/kome365/playtest.js            # seed 3・5・11・42 で ぜんぶの ボット
//   node tools/kome365/playtest.js --seeds 3,5 --bots careful,idle
// ボット（吹き出しの 矢印を 見る「ふつう」を もとに、くせを つける）
//   careful  ていねい：矢印の とおり。水は 浅く 保ち、中干し・溝切り・追肥（葉いろ 40 未満 だけ）・穂肥・暑い日の 入れかえ・刈りどき・15%
//   normal   ふつう：吹き出しの 矢印 だけ（矢印が なければ →）
//   idle     ほったらかし：しごと（←・↓の まく）は するが、水（↑↓）は 田うえの あと さわらない。雨まかせ
//   flood    みずびたし：毎日 ↑ で 水を いっぱいに。中干しを しない
//   hasty    せっかち：←で 刈れる ように なったら すぐ 刈る（青い）。乾燥も はじいて 行きすぎ
//   late     のんびり：刈りどきを 聞いても 2週間 ほうって おく。乾燥も ほうって おく
// 期待する 順：careful ≧ normal ＞ hasty・late ＞ idle・flood（idle・hasty・late は 半分 以上の 年で 二等 以下、flood は 収量が 7割 以下。雨の 多い 年は ほったらかしでも 一等に なる ことが ある）
const { chromium } = require('playwright');
const path = require('path');
const FILE = 'file://' + (process.env.KOME_FILE || path.resolve(__dirname, '../../kome365.html'));
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 && args[i+1] != null ? args[i+1] : d; }; /* 値の ない 旗は 既定（20周目） */
const SEEDS = opt('--seeds', '3,5,11,42').split(',').map(Number);
const BOTS = opt('--bots', 'careful,normal,idle,flood,hasty,late').split(',');
const KNOWN = ['careful', 'normal', 'idle', 'flood', 'hasty', 'late']; for (const b of BOTS) if (!KNOWN.includes(b)){ console.log('知らない ボット：' + b + '（' + KNOWN.join('・') + '）'); process.exit(2); }

const { HELPERS: BASE } = require('./helpers'); // ev・swipe は check.js と 共通（8周目）
const HELPERS = () => {
  window.playBot = (bot, seed) => {
    K3.manual = true; K3.fixedSeed = seed; K3.start(); const S = K3.S, f = S.f; let lateFrom = null, floodMark = null;
    for (let i=0;i<900 && !S.over;i++){
      const t = document.getElementById('say').textContent, a = K3.actions();
      let dir = /↑/.test(t) ? 'up' : /↓/.test(t) ? 'down' : /←/.test(t) ? 'left' : 'right', len = dir==='right' ? 110 : 160, fast = false;
      if (bot==='careful' && S.phase==='field' && f.planted){
        if ((a.left==='追肥' && f.N < 37) || (a.left==='穂肥' && Math.round(f.N) < 40) || a.left==='溝切り') dir = 'left'; /* 葉いろが こい 年は 追肥（37 以上）・穂肥（40 以上）を 見送る（23・31周目） */
        else if (a.left==='刈る' && f.gdd >= 980) dir = 'left';
        else if (S.weather[S.day+1] && S.weather[S.day+1].w==='台風' && S.weather[S.day].w!=='台風' && (f.heading || f.dat >= f.headDat - 2) && f.water < K3.TY_DEEP && floodMark !== S.day + ':' + f.water){ dir = 'up'; len = 400; fast = true; floodMark = S.day + ':' + f.water; } /* 73周目：あす 台風は はじいて 7.5cm（ふつうの ゆっくり↑も 7.5 に なった ので、ていねいが 6cm 超を 落として 41% たおれて いた） */
        else if (f.dat < 10){ dir = f.water < 4 ? 'up' : 'right'; len = 120; }
        else if (f.dat < 34){ dir = f.water < 1.5 ? 'up' : f.water > 4.5 ? 'down' : 'right'; len = 40; }
        else if (f.dat <= 44 && !f.heading && f.hoshiDays < 7){ if (f.water >= 1){ dir = 'down'; len = 400; fast = true; } else dir = 'right'; } /* 46周目：中干しは 7日で 切り上げる（9日目から 根が 切れる） */
        else { const tyN = S.weather[S.day].w==='台風' || (S.weather[S.day+1] && S.weather[S.day+1].w==='台風'); dir = f.water < 2 ? 'up' : f.water > 6 && !tyN ? 'down' : (f.heading && S.weather[S.day].w==='高温' && !f.flowToday ? 'up' : 'right'); len = 120; } /* 73周目：台風の 当日・前日は 深い まま */ /* 雨で 深く なったら 落とす（23周目） */
      }
      if (bot==='careful' && S.phase==='dry'){ dir = S.hv.moisture <= 15.5 ? 'left' : 'right'; }
      if (bot==='idle' && S.phase==='field' && f.planted && (dir==='up' || dir==='down')) dir = 'right';
      if (bot==='flood' && S.phase==='field' && f.planted){ if (dir==='down') dir = 'right'; if (f.water < 4 && dir==='right' && !S.hv.done && floodMark !== S.day + ':' + f.water) { dir = 'up'; len = 400; fast = true; floodMark = S.day + ':' + f.water; } } /* 73周目：↑で 水が 変わらない 日（雨の 日の 着地は 2.5cm）は → へ（同じ 日に 回り つづけて いた） */ /* はじきの 着地は よい 深さの 上 +1（分げつ 5）まで（43周目：5.5 を ねらうと 回り つづけた） */
      if (bot==='hasty'){ if (S.phase==='field' && a.left==='刈る') dir = 'left'; if (S.phase==='dry'){ if (S.hv.moisture > 15.5){ dir = 'right'; len = 300; fast = true; } else dir = 'left'; } }
      if (bot==='late'){ if (S.phase==='field' && a.left==='刈る'){ if (lateFrom == null) lateFrom = S.day; dir = S.day - lateFrom >= 14 ? 'left' : 'right'; if (dir==='right' && /↑/.test(t)) dir = 'up'; } if (S.phase==='dry' && S.hv.moisture <= 15.5 && S.hv.dryDays < 6) dir = 'right'; }
      swipe(dir, len, fast, true);
    }
    const r = S.result;
    return { bot, seed, over: S.over, day: S.day, done: S.hv.done, swipes: S.swipes, grade: r ? r.grade : '—', yield: r ? Math.round(r.yieldKg) : 0, seiryu: r ? Math.round(r.seiryu) : 0, taste: r ? r.taste : 0,
      chalk: r ? +r.chalk.toFixed(1) : 0, green: r ? +r.green.toFixed(1) : 0, crack: r ? +r.crack.toFixed(1) : 0, lodge: r ? Math.round(r.lodge*100) : 0, T: Math.round(f.T), root: Math.round(f.root), hoshi: f.hoshiDays, gdd: Math.round(S.hv.gdd), moist: +S.hv.moisture.toFixed(1), young: f.young, fs: f.flowerStress };
  };
};
const ORDER = { '一等':4, '二等':3, '三等':2, '規格外':1, '—':0 };
(async () => {
  const b = await chromium.launch(); const rows = []; let errs = 0;
  for (const seed of SEEDS){
    const p = await b.newPage({ viewport:{ width:390, height:844 }, hasTouch:true }); p.on('pageerror', e => { errs++; console.log('ERR', e.message); });
    await p.goto(FILE); await p.waitForFunction(() => window.K3); await p.evaluate(BASE); await p.evaluate(HELPERS);
    for (const bot of BOTS){ const r = await p.evaluate(([bot, seed]) => playBot(bot, seed), [bot, seed]); rows.push(r); }
    await p.close();
  }
  await b.close();
  console.log('| ボット | seed | 日 | 等級 | 収量 | 整粒 | 食味 | 白未熟 | 青 | 胴割れ | 倒伏% | 茎 | 根 | 中干し日 | 積算℃ | 水分 | スワイプ |');
  console.log('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
  for (const r of rows) console.log(`| ${r.bot} | ${r.seed} | ${r.day} | ${r.grade} | ${r.yield} | ${r.seiryu} | ${r.taste} | ${r.chalk} | ${r.green} | ${r.crack} | ${r.lodge} | ${r.T} | ${r.root} | ${r.hoshi} | ${r.gdd} | ${r.moist} | ${r.swipes} |`);
  // 順位（seed ごとの 平均の 収量×等級）
  const avg = {}; for (const r of rows){ (avg[r.bot] = avg[r.bot] || []).push(r); }
  const score = bot => avg[bot].reduce((a, r) => a + r.yield*(r.grade==='一等'?1:r.grade==='二等'?.9:r.grade==='三等'?.75:.5), 0)/avg[bot].length;
  const line = BOTS.map(bt => `${bt} ${Math.round(score(bt))}`).join(' ＞ ');
  console.log('\n点（収量×等級）：' + line);
  const ok = (c, name) => console.log((c ? '  ✔ ' : '  ✖ ') + name);
  const has = bt => BOTS.includes(bt);
  let bad = 0;
  if (has('careful') && has('normal')){ const c = score('careful') >= score('normal')*0.95; ok(c, 'ていねい ≧ ふつう'); if (!c) bad++; }
  if (has('normal') && has('idle')){ const c = score('normal') > score('idle')*1.15; ok(c, 'ふつう ＞ ほったらかし（15% 以上 差）'); if (!c) bad++; }
  if (has('normal') && has('flood')){ const c = score('normal') > score('flood')*1.08; ok(c, 'ふつう ＞ みずびたし'); if (!c) bad++; }
  if (has('normal') && has('hasty')){ const c = score('normal') > score('hasty')*1.05; ok(c, 'ふつう ＞ せっかち'); if (!c) bad++; }
  if (has('normal') && has('late')){ const c = score('normal') > score('late')*1.05; ok(c, 'ふつう ＞ のんびり'); if (!c) bad++; }
  for (const bt of ['idle', 'late']) if (has(bt)){ const n = avg[bt].filter(r => ORDER[r.grade] <= 3).length; const c = n*2 >= avg[bt].length; ok(c, bt + ' は 半分 以上の 年で 二等 以下（' + n + '/' + avg[bt].length + '）'); if (!c) bad++; }
  if (has('hasty') && has('normal')){ const g = avg.hasty.filter(r => r.green >= 10).length; const c = g === avg.hasty.length && score('hasty') <= score('normal')*0.9; ok(c, 'hasty は 毎年 青米 10% 以上で、点は ふつうの 9割 以下（青米 ' + g + '/' + avg.hasty.length + '、点 ' + Math.round(score('hasty')) + '／' + Math.round(score('normal')) + '）'); if (!c) bad++; } /* 75周目：満水の ゆっくり↑も かけ流しに 数える ように なって 白未熟が へり、整粒 70% の 線を またぐ 年が 出た。せっかちの しるしは 青米 */
  if (has('flood') && has('normal')){ const c = (avg.flood.reduce((m, r) => m + r.yield, 0) < avg.normal.reduce((m, r) => m + r.yield, 0)*0.7); ok(c, 'みずびたしの 収量は ふつうの 7割 以下（4つの 年の 合計）'); /* 35周目：台風の ない 年は 72% に なる */ /* 32周目：はじきの 上限 8cm で 深水に ならず、半分 以下は 行きすぎ（三等 280kg 台） */ if (!c) bad++; }
  if (errs){ console.log('✖ ページの エラー ' + errs + ' こ'); bad++; }
  process.exit(bad ? 1 : 0);
})();
