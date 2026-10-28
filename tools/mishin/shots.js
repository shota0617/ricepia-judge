// ミシン糸 一本どり：おもな 画面の スクショと、ならべた 1枚（sheet.png）
//   node tools/mishin/shots.js [幅 高さ]     # 例 360 640。ふだんは 390 844
// 書き出し先は MISHIN_OUT（なければ OS の 一時フォルダの mishin-shots）。リポジトリの 中には 書かない。
const { chromium } = require('playwright');
const path = require('path'), os = require('os'), fs = require('fs');
const FILE = 'file://' + path.resolve(__dirname, '../../mishin.html');
const OUT = process.env.MISHIN_OUT || path.join(os.tmpdir(), 'mishin-shots');
const VW = +(process.argv[2]||390), VH = +(process.argv[3]||844);
fs.mkdirSync(OUT, { recursive: true });
(async () => {
  const b = await chromium.launch(); const shots = [];
  const p = await b.newPage({ viewport:{ width:VW, height:VH }, deviceScaleFactor:2 });
  p.on('pageerror', e => console.log('ERR', e.message));
  const snap = async (name, label) => { await p.waitForTimeout(120); const f = path.join(OUT, name+'.png'); await p.screenshot({ path:f }); shots.push([f, label]); };
  await p.goto(FILE); await p.waitForTimeout(400); await snap('01-title', 'タイトル');
  await p.evaluate(() => { KB.manual = true; KB.fixedSeed = 1001; KB.start(); for (let i=0;i<40;i++) KB.step(1/60); });
  await snap('02-back', 'タイムアタック：裏（ほどき始めを 読む）');
  await p.evaluate(() => { const S = KB.S; const bb = KB.makeBag(4); Object.assign(bb, { face:'front', slide:0, golden:true }); S.bag = bb; for (let i=0;i<3;i++) KB.step(1/60); });
  await snap('03-front', '表（新米シール）');
  await p.evaluate(() => { const S = KB.S, L = KB.layout(); const bb = KB.makeBag(9); Object.assign(bb, { face:'back', start:'L', slide:0, single:false }); S.bag = bb;
    KB.down(L.x0+2, L.seamY); for (let i=0;i<12;i++){ KB.move(L.x0+2-i*3, L.seamY+i*3); KB.step(1/60); } let x = L.x0+40; for (let i=0;i<40;i++){ x += 3; KB.move(x, L.seamY+70); KB.step(1/60); } });
  await snap('04-pull', '引く（きつい目の 玉・ちりちりの 糸）');
  await p.evaluate(() => { const S = KB.S, L = KB.layout(), bb = S.bag; let x = S.px; for (let i=0;i<80 && !bb.tangle;i++){ x += 45; KB.move(x, L.seamY+70); KB.step(1/60); } KB.up(); for (let i=0;i<4;i++) KB.step(1/60); });
  await snap('05-tangle', 'もつれ（白糸を 引く）');
  await p.evaluate(() => { const S = KB.S; S.score = 8420; S.bags = 7; S.bestStreak = 3; S.quick = 2; S.fevers = 1; S.time = 0.01; KB.step(1/60); });
  await snap('06-result', '結果');
  await p.goto(FILE + '#coin'); await p.reload(); await p.waitForTimeout(400); // ハッシュだけ かわる ときは 読みなおさないので reload
  await p.evaluate(() => { KB.manual = true; for (let i=0;i<30;i++) KB.step(1/60); });
  await snap('07-practice', 'れんしゅう（拡大窓）');
  await p.waitForSelector('#skipBtn'); await p.click('#skipBtn');
  await snap('08-summary', 'れんしゅうの まとめ');
  // ならべた 1枚
  const cells = shots.map(([f, t]) => `<figure><img src="data:image/png;base64,${fs.readFileSync(f).toString('base64')}"><figcaption>${t}</figcaption></figure>`).join('');
  const s = await b.newPage({ viewport:{ width:1600, height:900 } });
  await s.setContent(`<style>body{margin:0;background:#0d1222;font-family:sans-serif;color:#f3efe4}.g{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;padding:14px}figure{margin:0}img{width:100%;border-radius:10px;display:block}figcaption{text-align:center;font-size:16px;margin-top:6px}</style><div class="g">${cells}</div>`);
  await s.waitForTimeout(300); await s.screenshot({ path: path.join(OUT, 'sheet.png'), fullPage:true });
  await b.close(); console.log('書き出し：' + OUT + '（sheet.png に ならべた 1枚）');
})();
