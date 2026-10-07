// ふるさと納税 返礼品画像（1200×1200 PNG）を生成する
// 実行: NODE_PATH=$(npm root -g) node furusato/images/build.mjs
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const outDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'out');

// ここを変えれば年産・商品を差し替えられる
const NENSAN = '令和8年産';
const PRODUCTS = [
  { id: '5kg', variety: 'あいちのかおり', weight: '5', detail: 'あいちのかおり 5kg（5kg×1袋）' },
  { id: '10kg', variety: 'あいちのかおり', weight: '10', detail: 'あいちのかおり 10kg' },
  { id: 'mix10kg', variety: 'こしひかり・あいちのかおり', weight: '10', detail: 'こしひかり 5kg ＋ あいちのかおり 5kg', mix: true },
];

const css = `
:root{--paper:#f5efe2;--paper2:#ebe2cf;--ink:#1d2740;--red:#b83a26;--gold:#a8844e;--sub:#5b5446}
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:1200px;height:1200px}
body{background:var(--paper);color:var(--ink);font-family:'Noto Sans JP',sans-serif;position:relative;overflow:hidden}
.serif{font-family:'Noto Serif JP',serif}
.frame{position:absolute;inset:28px;border:2px solid var(--gold);pointer-events:none}
.frame::after{content:'';position:absolute;inset:8px;border:1px solid var(--gold);opacity:.6}
.paper{position:absolute;inset:0;background:radial-gradient(ellipse at 50% 40%,#fbf7ee 0%,var(--paper) 55%,var(--paper2) 100%)}
.stamp{position:absolute;width:210px;height:210px;border-radius:50%;background:var(--red);color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;box-shadow:0 0 0 6px var(--paper),0 0 0 8px var(--red)}
.stamp .y{font-size:30px;font-weight:700;letter-spacing:.06em}
.stamp .n{font-size:76px;font-weight:900;line-height:1.05;letter-spacing:.08em}
`;

const head = (extra = '') => `<!doctype html><html lang="ja"><head><meta charset="utf-8">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Serif+JP:wght@500;700;900&family=Noto+Sans+JP:wght@400;500;700;900&display=block">
<style>${css}${extra}</style></head><body><div class="paper"></div><div class="frame"></div>`;

// ご飯茶碗のイラスト（米粒は固定シードで配置）
function bowl() {
  let s = 7;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const grains = [];
  for (let i = 0; i < 420; i++) {
    const x = 300 + (rnd() * 2 - 1) * 250;
    const top = 285 - 150 * Math.sqrt(Math.max(0, 1 - ((x - 300) / 255) ** 2));
    const y = top + rnd() * (300 - top);
    const r = rnd() * 180;
    grains.push(`<ellipse cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" rx="15" ry="8" transform="rotate(${r.toFixed(0)} ${x.toFixed(1)} ${y.toFixed(1)})" fill="url(#g)" stroke="#e4dccb" stroke-width="1"/>`);
  }
  return `<svg viewBox="0 0 600 560" width="600" height="560">
  <defs>
    <radialGradient id="g" cx="40%" cy="35%"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#f1ece1"/></radialGradient>
    <linearGradient id="b" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#2b3a5c"/><stop offset="1" stop-color="#17203a"/></linearGradient>
    <clipPath id="bc"><path d="M30 300 Q300 330 570 300 Q545 480 380 515 L220 515 Q55 480 30 300Z"/></clipPath>
  </defs>
  <g stroke="#cfc6b3" stroke-width="5" fill="none" stroke-linecap="round" opacity=".8">
    <path d="M230 120 q-25 -30 0 -60 q25 -30 0 -60"/><path d="M300 105 q-25 -30 0 -60 q25 -30 0 -60"/><path d="M370 120 q-25 -30 0 -60 q25 -30 0 -60"/>
  </g>
  <ellipse cx="300" cy="535" rx="150" ry="14" fill="#000" opacity=".12"/>
  <path d="M60 300 Q300 120 540 300 Z" fill="#f4efe4"/>
  ${grains.join('')}
  <path d="M30 300 Q300 330 570 300 Q545 480 380 515 L220 515 Q55 480 30 300Z" fill="url(#b)"/>
  <g clip-path="url(#bc)" fill="none" stroke="#a8844e" stroke-width="2.5" opacity=".75">
    ${Array.from({ length: 14 }, (_, i) => `<path d="M${-20 + i * 48} 520 a40 40 0 0 1 80 0"/><path d="M${-20 + i * 48} 520 a26 26 0 0 1 80 0" transform="translate(0,-14) scale(1)"/>`).join('')}
  </g>
  <path d="M30 300 Q300 330 570 300" fill="none" stroke="#a8844e" stroke-width="4"/>
  <path d="M215 515 L385 515 L372 540 L228 540 Z" fill="#17203a"/>
</svg>`;
}

function mainPage(p) {
  return head(`
.stamp{top:70px;left:70px}
.bowl{position:absolute;left:300px;top:110px}
.bottom{position:absolute;left:0;right:0;bottom:70px;text-align:center}
.lead{font-size:40px;font-weight:700;letter-spacing:.3em;color:var(--sub)}
.title{font-size:200px;font-weight:900;line-height:1.05;letter-spacing:.12em;margin-top:4px}
.title small{font-size:80px;color:var(--red);vertical-align:.55em;margin:0 .05em}
.row{display:flex;justify-content:center;align-items:center;gap:26px;margin-top:14px}
.variety{font-size:${p.mix ? 44 : 52}px;font-weight:700;letter-spacing:.08em}
.kg{background:var(--ink);color:#fff;border-radius:12px;padding:2px 28px 8px;font-size:84px;font-weight:900;line-height:1.1}
.kg span{font-size:48px;margin-left:4px}
.vert{position:absolute;right:76px;top:80px;writing-mode:vertical-rl;font-size:40px;font-weight:700;letter-spacing:.25em;color:var(--ink)}
.vert b{color:var(--red)}
`) + `
<div class="stamp serif"><div class="y">${NENSAN}</div><div class="n">新米</div></div>
<div class="vert serif">愛知県<b>西尾市</b>産</div>
<div class="bowl">${bowl()}</div>
<div class="bottom">
  <div class="lead serif">西尾のお米</div>
  <div class="title serif"><small>【</small>翔米<small>】</small></div>
  <div class="row"><div class="variety serif">${p.variety}</div><div class="kg serif">${p.weight}<span>kg</span></div></div>
</div></body></html>`;
}

function featurePage() {
  const items = [
    ['明治26年創業', '西尾市で130年余り続く米屋です。平成2年に農林水産大臣賞を受賞しました。'],
    ['有資格者が目利き', '農産物検査の国家資格をもつ検査員が、品種と品位を確かめて仕入れています。'],
    ['こだわりの精米', '胚芽の付け根を残すように精米し、お米の栄養と旨みを生かしています。'],
    ['顔の見える生産者', '20年以上取引を続ける西尾の農家が、カエルやザリガニのいる田んぼで育てています。'],
  ];
  const kanji = ['一', '二', '三', '四'];
  return head(`
h1{position:absolute;top:92px;left:0;right:0;text-align:center;font-size:66px;font-weight:900;letter-spacing:.1em}
h1 em{font-style:normal;color:var(--red)}
.sub{position:absolute;top:196px;left:0;right:0;text-align:center;font-size:30px;color:var(--sub);letter-spacing:.2em}
.grid{position:absolute;top:270px;left:90px;right:90px;display:grid;grid-template-columns:1fr 1fr;gap:30px}
.card{background:#fffdf8;border:2px solid #ddd2bb;border-radius:18px;padding:36px 34px;height:405px;position:relative}
.no{width:80px;height:80px;border-radius:50%;background:var(--ink);color:#fff;font-size:44px;font-weight:900;display:flex;align-items:center;justify-content:center}
.card h2{font-size:44px;font-weight:900;margin:22px 0 16px;letter-spacing:.04em}
.card p{font-size:27px;line-height:1.65;color:#3b3a36}
`) + `
<h1 class="serif"><em>翔米</em>が選ばれる理由</h1>
<div class="sub">近藤米穀店 らいすぴあ ／ 愛知県西尾市</div>
<div class="grid">${items.map(([t, d], i) => `<div class="card"><div class="no serif">${kanji[i]}</div><h2 class="serif">${t}</h2><p>${d}</p></div>`).join('')}</div>
</body></html>`;
}

function infoPage(p) {
  const rows = [
    ['品名', '西尾のお米【翔米】'],
    ['品種', p.variety],
    ['産地', '愛知県西尾市'],
    ['年産', NENSAN],
    ['内容量', p.detail],
    ['保存方法', '直射日光・高温多湿を避け、<br>涼しい場所で保存してください'],
    ['提供事業者', '近藤米穀店（らいすぴあ）'],
  ];
  return head(`
h1{position:absolute;top:96px;left:0;right:0;text-align:center;font-size:62px;font-weight:900;letter-spacing:.14em}
table{position:absolute;top:230px;left:110px;right:110px;width:980px;border-collapse:collapse;background:#fffdf8;font-size:34px}
th,td{border:2px solid #d6caae;padding:26px 30px;text-align:left;vertical-align:middle;line-height:1.5}
th{width:260px;background:var(--ink);color:#fff;font-weight:700;letter-spacing:.1em}
td{font-weight:500}
.note{position:absolute;bottom:92px;left:0;right:0;text-align:center;font-size:28px;color:var(--sub);letter-spacing:.06em}
`) + `
<h1 class="serif">返礼品の内容</h1>
<table>${rows.map(([k, v]) => `<tr><th>${k}</th><td>${v}</td></tr>`).join('')}</table>
<div class="note">明治26年創業　西尾市の米屋 近藤米穀店がお届けします</div>
</body></html>`;
}

const pages = [
  ...PRODUCTS.map((p) => [`01_main_${p.id}.png`, mainPage(p)]),
  ['02_features.png', featurePage()],
  ...PRODUCTS.map((p) => [`03_info_${p.id}.png`, infoPage(p)]),
];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 1200 } });
for (const [name, html] of pages) {
  await page.setContent(html, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: path.join(outDir, name) });
  console.log('wrote', name);
}
await browser.close();
