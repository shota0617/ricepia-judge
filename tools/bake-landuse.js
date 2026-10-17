// にしおさんぽGO：国土数値情報「土地利用細分メッシュ」（国土交通省、100mメッシュ、令和3年度）から、
// 遊べる範囲の土地利用（田・その他の農用地・森林・建物用地など）の表を作って nishio-go/landuse.json に保存する。
// 歩く地図とせかいちずは、OpenStreetMap に何も描かれていない所をこの表で塗る（田んぼと市街地の場所を実際に合わせる）。
//   使い方：.github/workflows/bake-landuse.yml が zip を取ってきて展開したあとで node tools/bake-landuse.js 展開したフォルダ
// 出典：国土数値情報（土地利用細分メッシュデータ）（国土交通省）を加工して作成。利用規約に基づくオープンデータ（商用可）
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const DIR = process.argv[2] || 'landuse-src';

// 範囲は せかいちず（pixel.js の WB）と同じ
const WB = { s: 34.68, w: 136.92, n: 35.05, e: 137.43 };
const DLAT = 1 / 1200, DLNG = 1 / 800;   // 100mメッシュ＝3次メッシュ（30秒×45秒）の10分の1
const lat0 = Math.floor(WB.s / DLAT) * DLAT, lng0 = Math.floor(WB.w / DLNG) * DLNG;
const H = Math.ceil((WB.n - lat0) / DLAT), W = Math.ceil((WB.e - lng0) / DLNG);
// 土地利用種別コード → 1文字（landuse.json の中身）。それ以外（解析範囲外など）は '.'
const CODE = { '0100': 'a', '0200': 'b', '0500': 'c', '0600': 'd', '0700': 'e', '0901': 'f', '0902': 'g', '1000': 'h', '1100': 'i', '1400': 'j', '1500': 'k', '1600': 'l' };
const NAME = { a: '田', b: 'その他の農用地', c: '森林', d: '荒地', e: '建物用地', f: '道路', g: '鉄道', h: 'その他の用地', i: '河川地及び湖沼', j: '海浜', k: '海水域', l: 'ゴルフ場', '.': 'なし' };

// メッシュコード（10けた）→ そのメッシュの南西の角
function meshLL(m) {
  const p = +m.slice(0, 2), u = +m.slice(2, 4), q = +m[4], v = +m[5], r = +m[6], w = +m[7], s = +m[8], x = +m[9];
  return { lat: p / 1.5 + q / 12 + r / 120 + s / 1200, lng: u + 100 + v / 8 + w / 80 + x / 800 };
}
// dBASE（.dbf）を読む：見出しのあとに同じ長さのレコードが並ぶ
function readDbf(file) {
  const b = fs.readFileSync(file), n = b.readUInt32LE(4), hl = b.readUInt16LE(8), rl = b.readUInt16LE(10);
  const fields = [];
  for (let o = 32; b[o] !== 0x0d; o += 32) fields.push({ name: b.toString('latin1', o, o + 11).replace(/\0.*$/, ''), len: b[o + 16] });
  const out = [];
  for (let i = 0; i < n; i++) {
    let o = hl + i * rl + 1;   // 先頭1バイトは削除フラグ
    const rec = {};
    for (const f of fields) { rec[f.name] = b.toString('latin1', o, o + f.len).trim(); o += f.len; }
    out.push(rec);
  }
  return { fields: fields.map(f => f.name), rows: out };
}

const grid = new Array(W * H).fill('.');
const count = {};
const dbfs = [];
(function walk(d) { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); if (fs.statSync(p).isDirectory()) walk(p); else if (/^L03-b-\d+_\d{4}\.dbf$/i.test(f)) dbfs.push(p); } })(DIR);
if (!dbfs.length) throw new Error(`${DIR} に L03-b の .dbf がありません`);
for (const f of dbfs) {
  const { fields, rows } = readDbf(f);
  const [fm, fc] = fields;   // L03b_001（メッシュコード）・L03b_002（土地利用種別コード）
  let used = 0;
  for (const r of rows) {
    const m = r[fm], c = CODE[r[fc]];
    if (!/^\d{10}$/.test(m)) continue;
    const ll = meshLL(m), y = Math.round((ll.lat - lat0) / DLAT), x = Math.round((ll.lng - lng0) / DLNG);
    if (x < 0 || y < 0 || x >= W || y >= H) continue;
    grid[(H - 1 - y) * W + x] = c || '.';   // 北の行から
    count[c || '.'] = (count[c || '.'] || 0) + 1; used++;
  }
  console.log(`${path.basename(f)}: ${rows.length} メッシュ、範囲内 ${used}（項目 ${fields.join(',')}）`);
}
console.log('土地利用', Object.entries(count).map(([k, v]) => `${NAME[k]} ${v}`).join('・'));
if ((count.a || 0) < 1000 || (count.e || 0) < 1000) throw new Error('田か建物用地が少なすぎます。読み方がちがうかもしれません');
// 1行ずつランレングス（文字＋回数の36進数）
const rows = [];
for (let y = 0; y < H; y++) {
  let s = '';
  for (let x = 0; x < W;) { const c = grid[y * W + x]; let j = x + 1; while (j < W && grid[y * W + j] === c) j++; s += c + (j - x).toString(36) + ','; x = j; }
  rows.push(s);
}
const out = path.join(ROOT, 'nishio-go', 'landuse.json');
const data = { _説明: '国土数値情報（土地利用細分メッシュデータ・令和3年度）（国土交通省）を加工して作成（tools/bake-landuse.js）。100mメッシュの土地利用。rows は北の行から、各行は「文字＋回数（36進数）,」のくり返し', codes: NAME,
  lat0: +lat0.toFixed(9), lng0: +lng0.toFixed(9), dLat: DLAT, dLng: DLNG, w: W, h: H, rows };
const text = JSON.stringify(data);
let old = '';
try { old = fs.readFileSync(out, 'utf8'); } catch (e) { /* まだ無い */ }
if (old === text) console.log('nishio-go/landuse.json: 変更なし');
else { fs.writeFileSync(out, text); console.log(`nishio-go/landuse.json: ${W}×${H} メッシュ・${fs.statSync(out).size} bytes`); }
