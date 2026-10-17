// にしおさんぽGO の「こよみ」：日付と季節で、まわりのようす（田んぼの色・見ごろ・あいさつ）と、みちしるべの行き先が変わる
// ・季節は月で分ける（春3〜5月・夏6〜8月・秋9〜11月・冬12〜2月）
// ・二十四節気の日付は年によって1日ほどずれるので、おおよその日付で「〇〇のころ」と出す
// ・田んぼのようすは、ふつうの米づくりの1年（田おこし→田植え→青田→稲刈り→刈田）を月で分けたもの
// ・見ごろ（SPOTS）は、spots.json・events.js・npcs.js に出典つきで書いてある事実だけから作る。spot は spots.json の id
// game.js・pixel.js より先に読む
(function (root) {
'use strict';

const SEASONS = [
  { id: 'winter', name: '冬', icon: '⛄', months: [12, 1, 2] },
  { id: 'spring', name: '春', icon: '🌸', months: [3, 4, 5] },
  { id: 'summer', name: '夏', icon: '🌻', months: [6, 7, 8] },
  { id: 'autumn', name: '秋', icon: '🍁', months: [9, 10, 11] },
];
// [月, 日（おおよそ）, 名前, 意味]
const SEKKI = [
  [1, 5, '小寒', '寒さが本格的になるころ'], [1, 20, '大寒', '一年でいちばん寒いころ'], [2, 4, '立春', '暦の上で春が始まるころ'], [2, 19, '雨水', '雪が雨にかわるころ'],
  [3, 5, '啓蟄', '土の中の虫が動き出すころ'], [3, 20, '春分', '昼と夜の長さがほぼ同じになるころ'], [4, 4, '清明', '草木が明るく生き生きするころ'], [4, 20, '穀雨', '田畑をうるおす雨がふるころ'],
  [5, 5, '立夏', '暦の上で夏が始まるころ'], [5, 21, '小満', '草木がしげり始めるころ'], [6, 5, '芒種', '稲など穂の出る作物の種をまくころ'], [6, 21, '夏至', '一年でいちばん昼が長いころ'],
  [7, 7, '小暑', '暑さが本格的になるころ'], [7, 22, '大暑', '一年でいちばん暑いころ'], [8, 7, '立秋', '暦の上で秋が始まるころ'], [8, 23, '処暑', '暑さがやわらぐころ'],
  [9, 7, '白露', '草に白い露がつくころ'], [9, 22, '秋分', '昼と夜の長さがほぼ同じになるころ'], [10, 8, '寒露', '草に冷たい露がつくころ'], [10, 23, '霜降', '霜がおり始めるころ'],
  [11, 7, '立冬', '暦の上で冬が始まるころ'], [11, 22, '小雪', '雪がちらつき始めるころ'], [12, 7, '大雪', '雪がふえてくるころ'], [12, 21, '冬至', '一年でいちばん昼が短いころ'],
];
// 田んぼのようす（月ごと）。tile は pixel.js の田畑のマスの描き方
const PADDY = [
  { months: [1, 2, 3], id: 'karita', name: '冬の田んぼ', icon: '🟫', tile: 'stubble', desc: '稲を刈ったあとの株が残る、冬の田んぼ。春を待っています。' },
  { months: [4], id: 'taokoshi', name: '田おこし', icon: '🚜', tile: 'soil', desc: '田植えにそなえて、田んぼの土をたがやすころ。' },
  { months: [5, 6], id: 'taue', name: '田植え', icon: '🌱', tile: 'flooded', desc: '水をはった田んぼに、苗を植えるころ。田んぼが空をうつす鏡になります。' },
  { months: [7, 8], id: 'aota', name: '青田', icon: '🌿', tile: 'green', desc: '稲がぐんぐん育つ、緑いっぱいの田んぼ。' },
  { months: [9, 10], id: 'inekari', name: '稲刈り', icon: '🌾', tile: 'gold', desc: '稲穂が黄金色にみのる、稲刈りのころ。新米の季節です。' },
  { months: [11, 12], id: 'karita', name: '刈田', icon: '🟫', tile: 'stubble', desc: '稲刈りが終わった田んぼ。株のあいだに、わらが残っています。' },
];
// 季節の見ごろ。from / to は [月, 日]（年をまたぐときは from > to）
const SPOTS = [
  { id: 'carrot', from: [1, 1], to: [2, 28], spot: 'hekinan-aoi-park', name: '碧南のにんじん', icon: '🥕', text: '冬にんじんの収穫のさかり' },
  { id: 'ume', from: [2, 1], to: [3, 15], spot: 'okazaki-iwazu-tenmangu', name: '梅', icon: '🌸', text: '岩津天満宮で、およそ400本の梅がさくころ' },
  { id: 'sakura-nishio', from: [3, 25], to: [4, 10], spot: 'nishio-castle', name: '桜', icon: '🌸', text: '西尾六万石桜まつりのころ' },
  { id: 'sakura-kogane', from: [3, 25], to: [4, 10], spot: 'kogane-zutsumi', name: '桜', icon: '🌸', text: '桜の名所の黄金堤が、花でいっぱいになるころ' },
  { id: 'sakura-okazaki', from: [3, 25], to: [4, 10], spot: 'okazaki-castle', name: '桜', icon: '🌸', text: '岡崎公園のまわりに、約800本のソメイヨシノがさくころ' },
  { id: 'sakura-oyama', from: [3, 23], to: [4, 5], spot: 'takahama-oyama', name: '桜', icon: '🌸', text: '大山の千本桜のころ' },
  { id: 'shidare', from: [4, 1], to: [4, 15], spot: 'kota-bunka-hiroba', name: 'しだれ桜', icon: '🌸', text: '幸田しだれ桜まつりのころ' },
  { id: 'chatsumi', from: [5, 1], to: [5, 31], spot: 'inariyama-chaen', name: '茶摘み', icon: '🍵', text: '抹茶のもとになるてん茶の、一番茶を摘むころ' },
  { id: 'rose', from: [5, 15], to: [6, 15], spot: 'okazaki-okudono-jinya', name: 'バラ', icon: '🌹', text: '奥殿陣屋のバラまつりのころ' },
  { id: 'ajisai-sangane', from: [6, 1], to: [6, 30], spot: 'sangane-kannon', name: 'あじさい', icon: '💠', text: '三ヶ根山で、およそ7万本のあじさいがさくころ' },
  { id: 'ajisai-honkoji', from: [6, 1], to: [6, 30], spot: 'kota-honkoji', name: 'あじさい', icon: '💠', text: '「三河のあじさい寺」本光寺の紫陽花まつりのころ' },
  { id: 'umi', from: [7, 1], to: [8, 31], spot: 'kira-waikiki', name: '海水浴', icon: '🏖️', text: '海水浴のシーズン' },
  { id: 'fudegaki', from: [9, 15], to: [9, 30], spot: 'kota-michinoeki', name: '筆柿', icon: '🍊', text: '幸田町の筆柿の出荷が始まるころ' },
  { id: 'koyo', from: [11, 15], to: [12, 10], spot: 'okazaki-kuragari', name: '紅葉', icon: '🍁', text: 'くらがり渓谷の紅葉の見ごろ' },
];

const md = d => (d.getMonth() + 1) * 100 + d.getDate();
const inRange = (d, from, to) => { const x = md(d), a = from[0] * 100 + from[1], b = to[0] * 100 + to[1]; return a <= b ? x >= a && x <= b : x >= a || x <= b; };
function season(d) { const m = d.getMonth() + 1; return SEASONS.find(s => s.months.includes(m)); }
function sekki(d) {   // いまの節気（その節気の日から次の節気の前の日まで）
  const x = md(d);
  let cur = SEKKI[SEKKI.length - 1];
  for (const s of SEKKI) if (x >= s[0] * 100 + s[1]) cur = s;
  return { name: cur[2], desc: cur[3] };
}
function paddy(d) { const m = d.getMonth() + 1; return PADDY.find(p => p.months.includes(m)); }
function daypart(d) {
  const h = d.getHours();
  if (h >= 5 && h < 10) return { id: 'morning', name: '朝', greet: 'おはよう！' };
  if (h >= 10 && h < 16) return { id: 'day', name: '昼', greet: 'こんにちは。' };
  if (h >= 16 && h < 19) return { id: 'evening', name: '夕方', greet: 'もう夕方だねえ。' };
  return { id: 'night', name: '夜', greet: 'こんばんは。' };
}
// 夏の土用の丑の日：土用（立秋＝おおよそ8月7日の前の18〜19日間）のうち、十二支が丑の日。
// 丑の日は12日ごと（2025年7月19日が土用の丑の日）。立秋が1日ずれる年は、土用の始まりと終わりの日だけずれることがある
function doyoUshi(d) {
  const day = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 864e5, ref = Date.UTC(2025, 6, 19) / 864e5;
  if (((day - ref) % 12 + 12) % 12 !== 0) return false;
  const risshu = Date.UTC(d.getFullYear(), 7, 7) / 864e5;
  return day >= risshu - 19 && day < risshu;
}
const seasonSpots = d => SPOTS.filter(s => inRange(d, s.from, s.to));
// 1行のこよみ：「10/17（土）🍁秋・寒露のころ・🌾稲刈り」
const WD = ['日', '月', '火', '水', '木', '金', '土'];
function line(d) {
  const s = season(d), k = sekki(d), p = paddy(d);
  return `${d.getMonth() + 1}/${d.getDate()}（${WD[d.getDay()]}）${s.icon}${s.name}・${k.name}のころ・${p.icon}${p.name}`;
}

root.NISHIO_SEASON = { SEASONS, SEKKI, PADDY, SPOTS, season, sekki, paddy, daypart, doyoUshi, seasonSpots, line, inRange };
if (typeof module !== 'undefined') module.exports = root.NISHIO_SEASON;
})(typeof window !== 'undefined' ? window : globalThis);
