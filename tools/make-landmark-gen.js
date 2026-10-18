// 型でつくる名所の絵の一覧（nishio-go/landmark-gen.js）を作る
//   node tools/dump-spot-ids.js && node tools/make-landmark-gen.js [写真のフォルダ] [写真の出典JSON] [地図に出るスポットの id の一覧]
// ・OpenStreetMap の名所（osm-spots.json）から、神社・お寺・駅・城跡・博物館・図書館・役所・教会・史跡・見どころを、
//   注目スポット（spots.json）と重ならず、専用の絵（pixel.js の LANDMARK_ART）もない所だけ選ぶ（注目スポットから150m以内は除く）。名所の絵が全部で1000か所になる数まで
// ・数えるのも選ぶのも、ゲームの地図に本当に出るスポットだけ（tools/dump-spot-ids.js が書き出す一覧。遊べる範囲の外・注目スポットと同じ所・すぐ近くの重複は出ない）
// ・写真（日本語版ウィキペディアの代表画像）がある所を先に選び、色は写真から測る（空・木・白とびを除いた色のうち、暗めでくすんだ色を屋根、
//   明るい色を壁、あざやかな色を差し色）。写真がない所は種類の基本の色（pixel.js の GEN_BASE）
// ・形の番号は、名前（古墳・門・稲荷・教会など）と、id から決まる番号で選ぶ
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const PHOTOS = process.argv[2] || path.join(ROOT, 'reference/osm-photos'), META = process.argv[3] || path.join(ROOT, 'reference/osm-photos.json');
const SHOWN = process.argv[4] || path.join(ROOT, 'reference/spot-ids.json');
if (!fs.existsSync(SHOWN)) { console.error(`${SHOWN} がありません。先に node tools/dump-spot-ids.js を動かしてください`); process.exit(1); }
const shown = new Set(JSON.parse(fs.readFileSync(SHOWN, 'utf8')));
const TOTAL = 1000;
const items = require(path.join(ROOT, 'nishio-go/osm-spots.json')).items;
const featured = require(path.join(ROOT, 'nishio-go/spots.json')).spots.filter(s => Number.isFinite(s.lat));
const pixel = fs.readFileSync(path.join(ROOT, 'nishio-go/pixel.js'), 'utf8');
const artBlock = pixel.match(/const LANDMARK_ART = \{[\s\S]*?\n\};/)[0];   // 専用の絵がある名所（注目スポットの f-… と、手描きした OpenStreetMap の id）
const artIds = new Set([...artBlock.matchAll(/'?(f-[a-z0-9-]+|[nwr]\d+)'?: '\w+'/g)].map(m => m[1]));
const artShown = [...artIds].filter(id => shown.has(id)).length;
if (artShown < artIds.size) console.warn(`専用の絵のうち ${artIds.size - artShown}か所は地図に出ません：${[...artIds].filter(id => !shown.has(id)).join(' ')}`);
const meta = fs.existsSync(META) ? JSON.parse(fs.readFileSync(META, 'utf8')) : [];
const photoOf = new Map(meta.map(m => [m.id, m]));
const dist = (a, b, c, d) => Math.hypot((a - c) * 111000, (b - d) * 91000);
const hash = s => { let x = 0; for (const ch of s) x = (x * 31 + ch.charCodeAt(0)) >>> 0; return x; };
const ORDER = ['shrine', 'temple', 'station', 'castle', 'museum', 'library', 'townhall', 'worship', 'art', 'historic', 'sight', 'view'];
function kindOf(cat, name) {
  if (cat === 'shrine' || cat === 'temple' || cat === 'worship') {   // OpenStreetMap の分類がまちがっていることがあるので、名前の終わりを先に見る
    if (/(神社|神宮|八幡宮|天満宮|社|宮)$/.test(name)) return 's';
    if (/(寺|院|堂|庵)$/.test(name)) return 't';
  }
  if (cat === 'shrine') return 's';
  if (cat === 'temple') return 't';
  if (cat === 'station') return 'e';
  if (cat === 'castle' || /城/.test(name)) return 'c';
  if (cat === 'worship') return /教会|チャペル|聖/.test(name) ? 'w' : /寺|院|堂/.test(name) ? 't' : 's';
  if (cat === 'museum' || cat === 'library' || cat === 'townhall' || cat === 'art') return 'p';
  if (cat === 'view' || cat === 'sight') return 'v';
  return 'h';
}
function variantOf(k, name, id) {
  const n = hash(id) % 4;
  if (k === 'h') return /古墳|塚/.test(name) ? 1 : /門/.test(name) ? 2 : /家|邸|住宅|屋敷/.test(name) ? 3 : 0;
  if (k === 'v') return /展望|タワー|台$/.test(name) ? 0 : /像/.test(name) ? 1 : /庭|園|池/.test(name) ? 2 : /木|松|楠|杉/.test(name) ? 3 : n;
  if (k === 'p') return /役所|役場|庁舎/.test(name) ? 2 : n === 2 ? 1 : n;
  if (k === 's') return /稲荷/.test(name) ? 0 : n;
  return n;
}
const lum = ([r, g, b]) => 0.3 * r + 0.59 * g + 0.11 * b;
const sat = ([r, g, b]) => { const mx = Math.max(r, g, b), mn = Math.min(r, g, b); return mx ? (mx - mn) / mx : 0; };
const hex = c => '#' + c.map(v => Math.round(v).toString(16).padStart(2, '0')).join('');
function colorsOf(file) {   // 写真の主な色（下の8割・まん中寄りを 6色に）
  let out;
  try { out = execFileSync('convert', [file, '-gravity', 'center', '-crop', '80%x70%+0+10%', '+repage', '-resize', '60x60!', '-colors', '8', '-format', '%c', 'histogram:info:'], { encoding: 'utf8' }); } catch (e) { return null; }
  const cols = [...out.matchAll(/^\s*(\d+):\s*\(\s*([\d.]+),\s*([\d.]+),\s*([\d.]+)/gm)].map(m => ({ n: +m[1], c: [+m[2], +m[3], +m[4]] }));
  const keep = cols.filter(({ c: [r, g, b] }) => !(b > r + 12 && b >= g && lum([r, g, b]) > 110) && !(g > r + 8 && g > b + 4) && lum([r, g, b]) < 238);   // 空・木・白とびを除く
  if (!keep.length) return null;
  const byL = [...keep].sort((a, b) => lum(a.c) - lum(b.c));
  const roof = byL.find(x => lum(x.c) > 35 && lum(x.c) < 150 && sat(x.c) < 0.5) || byL[0];
  const wall = [...byL].reverse().find(x => lum(x.c) > 140 && x !== roof) || byL[byL.length - 1];
  const vivid = keep.filter(x => sat(x.c) > 0.45 && lum(x.c) > 50).sort((a, b) => b.n - a.n)[0];
  return [hex(roof.c), hex(wall.c), vivid ? hex(vivid.c) : null];
}
const pool = items.filter(it => it[1] && shown.has(it[0]) && ORDER.includes(it[2]) && !artIds.has(it[0]) && !featured.some(f => dist(it[3], it[4], f.lat, f.lng) < 150));
pool.sort((a, b) => (photoOf.has(b[0]) - photoOf.has(a[0])) || ORDER.indexOf(a[2]) - ORDER.indexOf(b[2]) || a[0].localeCompare(b[0]));
const want = TOTAL - artShown, gen = {};
let withPhoto = 0;
for (const it of pool.slice(0, want)) {
  const k = kindOf(it[2], it[1]), v = variantOf(k, it[1], it[0]), p = photoOf.get(it[0]);
  let pal = [];
  if (p && fs.existsSync(path.join(PHOTOS, p.file))) { const c = colorsOf(path.join(PHOTOS, p.file)); if (c) { pal = c; withPhoto++; } }
  if (k === 's' && pal[2] && !(pal[2] && parseInt(pal[2].slice(1, 3), 16) > 150)) pal[2] = null;   // 鳥居の色は赤っぽいときだけ写真の色
  gen[it[0]] = [k, v, ...pal].map(x => x == null ? 0 : x);
}
const js = `// にしおさんぽGO：型でつくる名所の絵の一覧（tools/make-landmark-gen.js が作る。手で直さない）
// { OpenStreetMap の id: [種類（s神社 tお寺 e駅 c城跡 p博物館など h史跡 v見どころ w教会）, 形の番号, 屋根の色, 壁の色, 差し色（0は種類の基本の色）] }
// 色は、その場所の日本語版ウィキペディアの代表画像（Wikimedia Commons。出典は docs/landmark-photos.md）から測ったもの
window.NISHIO_LANDMARK_GEN = ${JSON.stringify(gen).replace(/\],"/g, '],\n"')};
`;
fs.writeFileSync(path.join(ROOT, 'nishio-go/landmark-gen.js'), js);
console.log(`型の絵 ${Object.keys(gen).length}か所（写真の色 ${withPhoto}）＋ 専用の絵 ${artShown}か所 ＝ ${Object.keys(gen).length + artShown}（地図に出る名所）`);
