// にしおさんぽGO：転がり方のバリエーション 200（転がり方ずかん）
// ・20の「うごき」（はねる・すべる・おもい・よく回る… 転がり方の 物理と 動きを かえる）× 10の「かざり」（転がった あとに のこる つぶ：さくら・もみじ・ほし…）＝ 200
// ・名前は「うごき・かざり」（例：ぴょんぴょん・さくら）。番号は No.001〜No.200
// ・あつめ方：転がった道のり 40マス（約320m）ごとに、まだ持っていない 転がり方を 1つ もらえる（もらったら すぐ その転がり方に）。
//   毎日 1つ「きょうの転がり方」が 持っていなくても 使える（はじめは これ）。「ふつう」（いままでの転がり方）にも もどせる
// ・せってい の「🍚 転がり方」から ずかんを開いて えらぶ。記録は この端末（localStorage nsg_koro）
// ・pixel.js が current() で いまの うごき・かざりを読む。game.js より後、pixel.js より前に読む
(function (root) {
'use strict';
// うごき：pixel.js の 転がり方に かける数・おきかえる値（書いていないものは ふつう）
//   accel 押す強さ・crr ころがり抵抗・lin 速さに比べて へる分・air 空気（小さいと いちばん速い速さが上がる）・bounce かべで はね返る強さ
//   hopV ぴょんと はねる速さ・hopEvery 1なら コトンのたびに はねる（ふつうは 2回に1回）・hopPow はねる高さ・grav 落ちる速さ
//   radius 回る半径（小さいと よく回る）・waddleV これより おそいと よちよち・sway よちよちの ゆれ・kotoSq コトンの つぶれ
//   stretch 速いときの のび・ghost いつも のこりかげ・wobble くねくね（マス）・shake ぶるぶる・trip ころぶ（1秒あたり）
//   spinAlways いつも こま回り・spinMix ころころしながら ひねる
const MOTIONS = [
  { name: 'ぴょんぴょん', desc: 'いつも はねながら転がる', p: { hopV: 1.6, hopEvery: 1, hopPow: 1.1 } },
  { name: 'すいすい', desc: '氷の上のように すべって、なかなか止まらない', p: { crr: 0.4, lin: 0.5 } },
  { name: 'どっしり', desc: 'おもくて、コトンのたびに ずしん', p: { accel: 0.7, crr: 1.3, bounce: 0.1, kotoSq: 2.2, grav: 1.4 } },
  { name: 'ぽよん', desc: 'かべで よく はずむ', p: { bounce: 0.85, kotoSq: 1.5 } },
  { name: 'くるくる', desc: 'どの向きでも こまのように回る', p: { spinAlways: true } },
  { name: 'よちよち', desc: 'かなり速くても よちよち ゆれて進む', p: { waddleV: 3 } },
  { name: 'ふわふわ', desc: 'とぶと ゆっくり 落ちてくる', p: { grav: 0.45, hopV: 3, hopPow: 0.9 } },
  { name: 'ぐるぐる', desc: 'ふつうの 倍 よく回る', p: { radius: 0.5 } },
  { name: 'のんびり', desc: 'ゆっくり 大きく回る', p: { radius: 2.2, accel: 0.8 } },
  { name: 'くねくね', desc: 'くねくね ゆれながら進む', p: { wobble: 0.25 } },
  { name: 'ぶるぶる', desc: 'ふるえながら転がる', p: { shake: 1 } },
  { name: 'ぺたぺた', desc: 'コトンのたびに ぺたっと つぶれる', p: { kotoSq: 3 } },
  { name: 'すってんころりん', desc: 'ときどき つまずいて ころぶ', p: { trip: 0.35 } },
  { name: 'ロケット', desc: 'びゅーんと速く、いつも のこりかげ', p: { air: 0.45, accel: 1.25, ghost: true } },
  { name: 'ぴたっ', desc: 'はなすと すぐ止まる', p: { crr: 2.4 } },
  { name: 'ゆらゆら', desc: '大きく ゆれながら進む', p: { sway: 0.55, waddleV: 2 } },
  { name: 'ねじねじ', desc: 'ひねりながら転がる', p: { spinMix: true } },
  { name: 'とことこ', desc: '小さく はねながら 歩くように進む', p: { waddleV: 2.5, hopV: 0.6, hopPow: 0.4, hopEvery: 1 } },
  { name: 'のびのび', desc: '大きく回って、速いと のびのび', p: { radius: 0.7, stretch: 2 } },
  { name: 'ジャンプ名人', desc: '高く とぶ', p: { hopPow: 1.6, hopV: 2.8, grav: 0.8 } },
];
// かざり：転がった あとに のこる つぶ（点の絵。# 色・o こい色・w 白）。rate：1マスに いくつ・life：のこる秒・move：fall 落ちる・up のぼる・stay その場・bounce はねる
const TRAILS = [
  { name: 'さくら', cols: ['#f6a8c0', '#fbd0dd'], dark: '#d7708f', move: 'fall', rate: 1.6, life: 1.6, g: ['.#.', '###', '.#.'] },
  { name: 'もみじ', cols: ['#e0502a', '#f08a2a', '#d8b030'], dark: '#9a3018', move: 'fall', rate: 1.4, life: 1.6, g: ['#.#', '###', '.o.'] },
  { name: 'ゆき', cols: ['#ffffff', '#eaf4ff'], dark: '#b8c8e0', move: 'fall', rate: 2, life: 1.8, g: ['o.o', '.#.', 'o.o'] },
  { name: 'ほし', cols: ['#ffd84a', '#fff0a0'], dark: '#d09a10', move: 'up', rate: 1.2, life: 1.2, g: ['..#..', '.###.', '#####', '.#.#.'] },
  { name: 'ハート', cols: ['#ff5a7a', '#ff8aa0'], dark: '#c02848', move: 'up', rate: 1, life: 1.4, g: ['#.#', '###', '.#.'] },
  { name: 'おんぷ', cols: ['#3a4a9a', '#2a2a2a'], dark: '#1a1a3a', move: 'up', rate: 0.9, life: 1.5, g: ['.##', '.#.', '##.', '##.'] },
  { name: 'しゃぼんだま', cols: ['#bfe8ff'], dark: '#6ab0e0', move: 'up', rate: 0.8, life: 2, g: ['.o.', 'o#o', '.o.'] },
  { name: 'きらきら', cols: ['#fff4b0', '#ffe060'], dark: '#e0a820', move: 'stay', rate: 2.2, life: 0.7, g: ['.#.', '#w#', '.#.'] },
  { name: 'にじ', cols: ['#ff5050', '#ffa040', '#ffe040', '#60d060', '#40a0ff', '#6060e0', '#b060e0'], dark: null, move: 'stay', rate: 6, life: 1.1, g: ['##', '##'], cycle: true },
  { name: 'ごはんつぶ', cols: ['#ffffff'], dark: '#3a3a3a', move: 'bounce', rate: 1.3, life: 1.3, g: ['o#o'] },
];
const N = MOTIONS.length * TRAILS.length;   // 200
const LIST = [];
for (let m = 0; m < MOTIONS.length; m++) for (let t = 0; t < TRAILS.length; t++) {
  const id = m * TRAILS.length + t;
  LIST.push({ id, no: 'No.' + String(id + 1).padStart(3, '0'), name: `${MOTIONS[m].name}・${TRAILS[t].name}`, motion: MOTIONS[m], trail: TRAILS[t], desc: `${MOTIONS[m].desc}。うしろに ${TRAILS[t].name}` });
}
const KEY = 'nsg_koro', STEP = 40;   // 40マス（約320m）ごとに 1つ
const load = () => { try { return Object.assign({ u: [], sel: 'daily', dist: 0, n: 0 }, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) { return { u: [], sel: 'daily', dist: 0, n: 0 }; } };
const st = load();
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) { /* 保存できない端末 */ } };
const ymd = () => { const d = new Date(Date.now() + 9 * 3600e3); return d.toISOString().slice(0, 10); };
const hash = s => { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0; return h; };
const dailyId = () => hash('koro:' + ymd()) % N;   // 日本時間の日づけで きまる（だれでも 同じ）
const has = id => st.u.includes(id);
function current() {   // いまの転がり方（ふつうなら null）
  const id = st.sel === 'daily' ? dailyId() : st.sel === 'none' ? -1 : st.sel;
  return id >= 0 && id < N ? LIST[id] : null;
}
function select(sel) {
  if (sel !== 'daily' && sel !== 'none' && !(has(sel) || sel === dailyId())) return false;
  st.sel = sel; save(); paint();
  if (root.nsgTrack) root.nsgTrack('koro_select', { id: typeof sel === 'number' ? sel + 1 : sel });
  return true;
}
function addDist(d) {   // 転がった道のり（マス）。40マスごとに 新しい転がり方を もらう
  if (!(d > 0) || d > 3) return;
  st.dist += d;
  if (st.dist < STEP) { if (Math.random() < 0.02) save(); return; }
  st.dist -= STEP;
  const left = LIST.filter(x => !has(x.id));
  if (!left.length) { save(); return; }
  const got = left[hash('koro-get:' + st.n++) % left.length];
  st.u.push(got.id); st.sel = got.id; save(); paint();
  const G = root.nishioGo;
  // 知らせは1行で短く（40マスごとに出るので、3行だと 地図の上が いつも ふさがる）。どう転がるかは ずかんで
  if (G && G.toast) G.toast(`🍚 転がり方「${got.name}」GET！`);
  if (root.nsgTrack) root.nsgTrack('koro_unlock', { id: got.id + 1, count: st.u.length });
}

/* ---------- ずかん（せってい の 🍚 転がり方） ---------- */
const css = document.createElement('style');
css.textContent = `#koroDex{position:fixed;inset:0;z-index:2000;background:rgba(10,20,10,.55);display:flex;align-items:flex-end;justify-content:center}
#koroDex[hidden]{display:none}
#koroDex .kd{background:#fffdf4;width:min(100%,560px);max-height:88vh;border-radius:18px 18px 0 0;display:flex;flex-direction:column;box-shadow:0 -6px 24px rgba(0,0,0,.25)}
#koroDex header{padding:14px 16px 8px;border-bottom:1px solid #e8e0c8}
#koroDex h3{margin:0 0 4px;font-size:1.1rem}
#koroDex .kd-cnt{font-size:.85rem;color:#6a6250}
#koroDex .kd-top{display:flex;gap:8px;margin-top:8px;flex-wrap:wrap}
#koroDex .kd-top button,#koroDex .kd-close{border:2px solid #2f5d34;background:#fff;border-radius:999px;padding:6px 12px;font:inherit;font-size:.85rem}
#koroDex button[aria-pressed=true]{background:#2f5d34;color:#fff}
#koroDex .kd-grid{overflow:auto;padding:10px 12px 18px;display:grid;grid-template-columns:repeat(auto-fill,minmax(98px,1fr));gap:8px}
#koroDex .kd-cell{border:2px solid #d8d0b8;border-radius:12px;background:#fff;padding:6px 6px 8px;font:inherit;font-size:.72rem;line-height:1.35;text-align:left;min-height:100px;display:flex;flex-direction:column;align-items:flex-start;justify-content:flex-start}   /* ボタンは 中身の高さで のびないので、絵と2行の名前が入る高さにする */
#koroDex .kd-cell b{display:block;font-size:.66rem;color:#8a8270}
#koroDex .kd-cell i{display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:4px;vertical-align:-1px;box-shadow:0 0 0 1px rgba(0,0,0,.35)}
#koroDex .kd-cell img{display:block;width:48px;height:32px;image-rendering:pixelated;margin:2px 0}
#koroDex .kd-desc{margin-top:4px;font-size:.8rem;color:#4a5a40}
#koroDex .kd-cell[aria-pressed=true] b{color:#d8ecd8}
#koroDex .kd-cell[disabled]{background:#eeeae0;color:#aaa29a;border-style:dashed}
#koroDex .kd-cell.on{border-color:#2f5d34;box-shadow:0 0 0 2px #2f5d34 inset}
#koroDex .kd-cell.today{border-color:#e0a820}
#koroDex footer{padding:8px 16px 14px;border-top:1px solid #e8e0c8;display:flex;justify-content:space-between;align-items:center;gap:8px;font-size:.8rem;color:#6a6250}`;
document.head.appendChild(css);
let dex = null;
function build() {
  dex = document.createElement('div');
  dex.id = 'koroDex'; dex.hidden = true;
  dex.setAttribute('role', 'dialog'); dex.setAttribute('aria-modal', 'true'); dex.setAttribute('aria-label', '転がり方ずかん');
  dex.innerHTML = `<div class="kd"><header><h3>🍚 転がり方ずかん</h3><div class="kd-cnt"></div><div class="kd-desc"></div>
    <div class="kd-top"><button type="button" data-sel="daily"></button><button type="button" data-sel="none">ふつう</button></div></header>
    <div class="kd-grid"></div><footer><span>転がった道のり 約320mごとに 1つ もらえます</span><button type="button" class="kd-close">とじる</button></footer></div>`;
  dex.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (e.target === dex || (b && b.classList.contains('kd-close'))) { close(); return; }
    if (!b) return;
    if (b.dataset.sel) select(b.dataset.sel);
    else if (b.dataset.id) select(+b.dataset.id);
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && dex && !dex.hidden) close(); });
  document.body.appendChild(dex);
}
// ずかんの絵（48×32）：お米（歩く地図と同じ 丸く見える描き方）と、うしろに のこる かざりの つぶ。まだのものは 灰色の かげだけ。かざりごとに 1枚つくって とっておく
const icons = {};
function icon(t, locked) {
  const k = locked ? 'x' : t;
  if (icons[k]) return icons[k];
  const P = root.nishioPixel;
  if (!P || !P.drawRice) return '';
  const c = document.createElement('canvas'); c.width = 48; c.height = 32;
  const x = c.getContext('2d'); x.imageSmoothingEnabled = false;
  if (!P.drawRice(x, 33, 17.5, locked ? 0 : 0.35, 0, 'smile')) return '';
  if (locked) { x.globalCompositeOperation = 'source-atop'; x.fillStyle = '#cfc8b8'; x.fillRect(0, 0, 48, 32); x.globalCompositeOperation = 'source-over'; }
  else {
    const tr = TRAILS[t];
    [[2, 19], [10, 9], [14, 23]].forEach(([ox, oy], i) => {
      const col = tr.cols[i % tr.cols.length];
      tr.g.forEach((row, yy) => [...row].forEach((ch, xx) => {
        if (ch === '.') return;
        x.fillStyle = ch === 'w' ? '#ffffff' : ch === 'o' ? (tr.dark || col) : col;
        x.fillRect(ox + xx, oy + yy, 1, 1);
      }));
    });
  }
  return (icons[k] = c.toDataURL());
}
function paint() {
  const row = document.getElementById('koroName');
  const cur = current();
  if (row) row.textContent = cur ? `${cur.name}（${cur.no}）` : 'ふつう';
  if (!dex || dex.hidden) return;
  const today = dailyId();
  dex.querySelector('.kd-cnt').textContent = `あつめた ${st.u.length} / ${N}　いま：${cur ? cur.name : 'ふつう'}`;
  dex.querySelector('.kd-desc').textContent = cur ? cur.desc : 'いままでの転がり方';   // どう転がるか（スマホでは title が見えないので、いまの転がり方だけ ここに）
  const tb = dex.querySelector('[data-sel=daily]');
  tb.textContent = `☀️ きょうの転がり方（${LIST[today].name}）`;
  tb.setAttribute('aria-pressed', String(st.sel === 'daily'));
  dex.querySelector('[data-sel=none]').setAttribute('aria-pressed', String(st.sel === 'none'));
  const curId = cur ? cur.id : -1;
  dex.querySelector('.kd-grid').innerHTML = LIST.map(x => {
    const open = has(x.id) || x.id === today;
    const col = x.trail.cols[0], im = icon(x.id % TRAILS.length, !open);   // 絵が まだ描けないときは、色の四角
    return `<button type="button" class="kd-cell${x.id === curId ? ' on' : ''}${x.id === today ? ' today' : ''}" data-id="${x.id}"${open ? '' : ' disabled'} aria-pressed="${x.id === curId}" title="${open ? x.desc : 'まだ'}">
      <b>${x.no}${x.id === today ? ' ☀️' : ''}</b>${im ? `<img src="${im}" alt=""/>` : ''}${open ? (im ? '' : `<i style="background:${col}"></i>`) + x.name : '？？？'}</button>`;
  }).join('');
}
function open() { if (!dex) build(); dex.hidden = false; paint(); const c = dex.querySelector('.kd-close'); if (c) c.focus(); }
function close() { if (dex) dex.hidden = true; }
document.addEventListener('DOMContentLoaded', () => {
  const b = document.getElementById('koroOpen');
  if (b) b.addEventListener('click', open);
  paint();
});

root.NISHIO_KOROSTYLE = { MOTIONS, TRAILS, list: () => LIST, current, select, addDist, open, close, dailyId, get state() { return st; } };
})(window);
