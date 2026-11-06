// 米作り365：おもな 画面の スクショと、ならべた 1枚（sheet.png）
//   node tools/kome365/shots.js [幅 高さ]     # 例 360 560。ふだんは 390 844
// 書き出し先は KOME_OUT（なければ OS の 一時フォルダの kome365-shots）。リポジトリの 中には 書かない。
const { chromium } = require('playwright');
const path = require('path'), os = require('os'), fs = require('fs');
const FILE = 'file://' + path.resolve(__dirname, '../../kome365.html');
const OUT = process.env.KOME_OUT || path.join(os.tmpdir(), 'kome365-shots');
const VW = +(process.argv[2]||390), VH = +(process.argv[3]||844);
fs.mkdirSync(OUT, { recursive: true });
(async () => {
  const b = await chromium.launch(); const shots = [];
  const p = await b.newPage({ viewport:{ width:VW, height:VH }, deviceScaleFactor:2 });
  let errs = 0; p.on('pageerror', e => { errs++; console.log('ERR', e.message); });
  const snap = async (name, label) => { await p.waitForTimeout(150); const f = path.join(OUT, name+'.png'); await p.screenshot({ path:f }); shots.push([f, label]); };
  await p.goto(FILE); await p.waitForTimeout(600); await snap('01-title', 'はじめの 画面');
  const scenes = [['seed','02-seed','たねもみ（桶に つけて 芽を 出す）'], ['nursery','03-nursery','なえ（はこで 30日）'], ['tiller','04-tiller','分げつ（浅い 水）'], ['nakaboshi','05-nakaboshi','中干し（ひび）'], ['heading','06-heading','出穂'], ['harvest','07-harvest','稲刈り（← で 1列ずつ）'], ['dry','08-dry','乾燥（15% で とめる）']];
  for (const [s, name, label] of scenes){ await p.evaluate(s => { K3.manual = true; K3.fixedSeed = 11; K3.jump(s); for (let i=0;i<100;i++) K3.step(1/60); }, s) /* はんこ・ことばの 字が きえて から */; await snap(name, label); }
  await p.evaluate(() => { K3.jump('result'); }); await p.waitForTimeout(700); await snap('09-result', '検査の 結果');
  const cells = shots.map(([f, t]) => `<figure><img src="data:image/png;base64,${fs.readFileSync(f).toString('base64')}"><figcaption>${t}</figcaption></figure>`).join('');
  const s = await b.newPage({ viewport:{ width:1600, height:900 } });
  await s.setContent(`<style>body{margin:0;background:#0d1222;font-family:sans-serif;color:#f3efe4}.g{display:grid;grid-template-columns:repeat(5,1fr);gap:14px;padding:14px}figure{margin:0}img{width:100%;border-radius:10px;display:block}figcaption{text-align:center;font-size:15px;margin-top:6px}</style><div class="g">${cells}</div>`);
  await s.waitForTimeout(300); await s.screenshot({ path: path.join(OUT, 'sheet.png'), fullPage:true });
  await b.close(); console.log('書き出し：' + OUT + '（sheet.png に ならべた 1枚）'); if (errs){ console.log('✖ ページの エラー ' + errs + ' こ'); process.exit(1); }
})();
