// にしおさんぽGO の宣伝まわり：シェア（SNS・LINE・画像）と、広告・QR・シェアから来た人の受けとり
// ・シェアのリンクには UTM（utm_source=share）を付けて、シェアから来た人を数えられるようにする
// ・シェア用の画像（1200×630）は、その人のきろく（レベル・めぐった名所・話した人）と当店の名前をのせて、その場で描く（どこにも送らない）
// ・西尾のPRになるように：シェアの文に西尾の名物（meibutsu.js。出典のある名前だけ）を入れる。名所のシェア（spot）は ?spot= でその名所を開き、
//   説明（spots.json の desc。出典つき）を画像にのせる。おたよりが反映されたシェア（voice）は「みんなの声で西尾の名所がふえる」ことを伝える
// ・広告やQRのリンクのパラメータ：?c=キャンペーンのid ／ ?spot=スポットのid（そのスポットを見せる）／ ?play=1（操作して遊ぶで始める）／ ?from=どこから（チラシ・POP など）
//   来た人は analytics.js の landing イベントで数える（utm_* もいっしょに）
(() => {
'use strict';
const G = window.nishioGo;
if (!G) return;
const $ = id => document.getElementById(id);
const SITE = 'https://go.ricepia.jp/';
const track = (n, p) => { try { G.track(n, p); } catch (e) { /* noop */ } };

/* ---------- 広告・QR・シェアから来た人 ---------- */
const q = new URLSearchParams(location.search);
const land = {};
for (const k of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'c', 'spot', 'from', 'play']) if (q.get(k)) land[k] = q.get(k).slice(0, 60);
// 友だちのシェアから来た、まだ遊んだことのない人：はじめて遊ぶときに game.js が +20pt（nsg_friend：1＝これから、2＝もらった）
if (land.utm_source === 'share' && !G.started) { try { if (!localStorage.getItem('nsg_friend')) localStorage.setItem('nsg_friend', '1'); } catch (e) { /* noop */ } }
if (Object.keys(land).length) {
  track('landing', land);
  if (land.c) track('campaign_landing', { campaign: land.c });
  if (land.play === '1') {   // 広告から「操作して遊ぶ」ですぐ始める（はじめての人は始め、もう始めている人は切り替える）
    if (document.getElementById('intro') && !document.getElementById('intro').hidden) G.begin(true); else G.playMode();
  }
  if (land.spot) {   // スポットの読み込みを待って見せる（最大20秒）
    let n = 0;
    const t = setInterval(() => { if (G.focusSpot(land.spot) || ++n > 40) clearInterval(t); }, 500);
  }
  if (land.c) {   // そのキャンペーンをお知らせ
    let n = 0;
    const t = setInterval(() => {
      const c = G.liveCampaigns().find(x => x.id === land.c);
      if (c) { G.toast ? G.toast(`${c.icon} ${c.title}：${c.text || 'きろくのページを見てね'}`) : 0; clearInterval(t); } else if (++n > 20) clearInterval(t);
    }, 500);
  }
}

/* ---------- シェア ---------- */
// 西尾市版（提案用デモ）でシェアしたときは、受け取った人も西尾市版で開くように ed=city を付ける
const shareUrl = kind => `${SITE}?${window.NSG_EDITION && !window.NSG_EDITION.shops ? `ed=${window.NSG_EDITION.id}&` : ''}${kind === 'spot' && curSpot ? `spot=${encodeURIComponent(curSpot.id)}&` : ''}utm_source=share&utm_medium=social&utm_campaign=${encodeURIComponent(kind)}`;
let cur = 'log', curDot = null, curSpot = null, curVoice = '';
// 西尾の名物（「抹茶とうなぎのまち」）。名前は meibutsu.js（西尾市観光協会などの出典）から。X の字数に入るよう短く
const meibutsuShort = () => { const m = (window.NISHIO_MEIBUTSU || []).filter(x => !x.area).slice(0, 2).map(x => x.name.replace(/^(西尾の|一色産)/, '')); return m.length ? `${m.join('と')}のまち・` : ''; };
const clip = (t, n) => { const a = [...String(t || '')]; return a.length > n ? a.slice(0, n - 1).join('') + '…' : a.join(''); };
const D = () => window.NISHIO_DOTS;
function shareText() {
  const s = G.stats(), tags = `#にしおさんぽGO #西尾市${window.NSG_EDITION && !window.NSG_EDITION.shops ? '' : ' #らいすぴあ'}`;
  const invite = `このリンクから始めると +${G.FRIEND_BONUS || 20}pt もらえるよ`;
  if (cur === 'dot' && curDot != null && D()) {   // 見つけたドット絵をシェア
    const f = D().info(curDot);
    return `にしおさんぽGOの「西尾ドット絵帳」で「${f.title}」の絵を見つけたよ🖼️（No.${f.no}）\n${invite}\n${tags}`;
  }
  if (cur === 'spot' && curSpot) {   // 名所をシェア（受け取った人は、その名所が開く）
    return `西尾の「${curSpot.name}」📍${curSpot.desc ? `\n${clip(curSpot.desc, 46)}` : ''}\nにしおさんぽGOで、西尾の名所をめぐろう\n${tags}`;
  }
  if (cur === 'voice' && curVoice) {   // おたよりが反映された
    return `わたしの声で、にしおさんぽGOが かわりました📮「${clip(curVoice, 34)}」\nみんなの声で、西尾の名所がふえていきます\n${tags}`;
  }
  return `にしおさんぽGOで、${meibutsuShort()}西尾を歩いて Lv${s.lv}「${s.title}」になったよ🚶\nめぐった名所 ${s.places}か所・話した人 ${s.met}人・まちメモ ${s.memos}こ\n${invite}\n${tags}`;
}
// シェア用の画像：空と田んぼ（こよみの季節の色）の上に、きろくと当店の名前
const logo = new Image();
logo.src = 'nishio-go/logo.svg';
function drawCard() {
  const cv = $('shareCard'), x = cv.getContext('2d'), W = cv.width, H = cv.height, s = G.stats();
  const KO = window.NISHIO_SEASON, p = KO ? KO.paddy(new Date()) : null;
  const field = { gold: ['#cfae4a', '#b08a2a'], flooded: ['#8fbfd8', '#4f9a35'], soil: ['#8a6a44', '#6e5233'], stubble: ['#a89a6a', '#7d6f48'] }[p && p.tile] || ['#86b54c', '#6a9a36'];
  const sky = x.createLinearGradient(0, 0, 0, H * 0.62);
  sky.addColorStop(0, '#9fd6ff'); sky.addColorStop(1, '#e8f6ff');
  x.fillStyle = sky; x.fillRect(0, 0, W, H);
  x.fillStyle = field[0]; x.fillRect(0, H * 0.62, W, H * 0.38);
  for (let yy = H * 0.62 + 10; yy < H - 70; yy += 22) { x.fillStyle = field[1]; x.fillRect(0, yy, W, 6); }   // 田んぼのうね
  if (logo.complete && logo.naturalWidth) x.drawImage(logo, 40, 34, 544, 80);
  else { x.fillStyle = '#1f5a25'; x.font = 'bold 64px "DotGothic16", sans-serif'; x.fillText('にしおさんぽGO', 40, 100); }
  const dc = cur === 'dot' && curDot != null && D() ? D().canvas(curDot) : null;   // 見つけたドット絵（右に金の額縁で大きく）
  const maxW = dc ? 700 : W - 80;   // 文字は絵にかからないはばに（入らなければ字を小さく）
  const line = (t, size, y, bold) => {
    let f = size;
    do { x.font = `${bold ? 'bold ' : ''}${f}px "DotGothic16", sans-serif`; f -= 2; } while (f > 20 && x.measureText(t).width > maxW);
    x.lineWidth = Math.max(6, Math.round(f / 6)); x.strokeText(t, 40, y); x.fillText(t, 40, y);
  };
  x.textAlign = 'left'; x.textBaseline = 'alphabetic'; x.strokeStyle = '#fff'; x.fillStyle = '#2b2b2b';
  const lv = `🚶 Lv${s.lv}「${s.title}」`, rec = `めぐった名所 ${s.places}か所 ・ 話した人 ${s.met}人 ・ ${s.points.toLocaleString()}pt`;
  if (dc) {   // 絵の名前を大きく、そのあとに「見つけた」と きろく
    const f = D().info(curDot);
    line(`🖼️ ${f.title}`, 66, 240, true);
    line(`西尾ドット絵帳で見つけた！（No.${f.no}）`, 36, 310);
    line(`${lv} ・ ${s.points.toLocaleString()}pt`, 30, 362);
    const sz = 336, dx = W - sz - 60, dy = 120;
    x.fillStyle = '#c99a2e'; x.fillRect(dx - 18, dy - 18, sz + 36, sz + 36);
    x.fillStyle = '#f6d36b'; x.fillRect(dx - 10, dy - 10, sz + 20, sz + 20);
    x.imageSmoothingEnabled = false; x.drawImage(dc, dx, dy, sz, sz); x.imageSmoothingEnabled = true;
  } else if (cur === 'spot' && curSpot) {   // 名所の名前を大きく、説明（出典つきの desc）を2行まで
    line(`📍 ${curSpot.name}`, 66, 240, true);
    const d = [...String(curSpot.desc || '')];
    if (d.length) { line(d.slice(0, 30).join(''), 32, 304); if (d.length > 30) line(clip(d.slice(30).join(''), 30), 32, 350); }
    line('にしおさんぽGOで、西尾の名所をめぐろう', 30, d.length ? 400 : 310);
  } else if (cur === 'voice' && curVoice) {
    line('📮 わたしの声が反映されました', 56, 230, true);
    line(clip(curVoice, 40), 34, 300);
    line('みんなの声で、西尾の名所がふえていく', 30, 352);
  } else {
    line(lv, 66, 240, true);
    line(rec, 36, 310);
    if (KO) line(KO.line(new Date()), 30, 362);
  }
  x.fillStyle = 'rgba(0,0,0,.78)'; x.fillRect(0, H - 70, W, 70);
  x.fillStyle = '#fff'; x.font = '30px "DotGothic16", sans-serif';
  x.fillText((window.NSG_EDITION && window.NSG_EDITION.share) || '西尾のお米屋さん 近藤米穀店・らいすぴあ が つくったお散歩ゲーム', 30, H - 26);
  x.textAlign = 'right'; x.fillStyle = '#ffe27a'; x.fillText('go.ricepia.jp', W - 30, H - 26);
}
function openShare(kind, opt) {
  cur = kind;
  curDot = opt && opt.dot != null ? opt.dot : null;
  curSpot = opt && opt.spot ? opt.spot : null;
  curVoice = opt && opt.voice ? String(opt.voice) : '';
  const text = shareText(), url = shareUrl(kind);
  drawCard();
  $('shareText').textContent = `${text}\n${url}`;
  $('shareX').href = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;
  $('shareLine').href = `https://social-plugins.line.me/lineit/share?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`;
  $('shareFb').href = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`;
  $('shareNative').hidden = !navigator.share;
  $('share').hidden = false;
  track('share_open', { kind });
}
function cardBlob() { return new Promise(r => $('shareCard').toBlob(b => r(b), 'image/png')); }
$('share').addEventListener('click', async e => {
  const b = e.target.closest('[data-share]');
  if (e.target === $('share')) { $('share').hidden = true; return; }
  if (!b) return;
  const via = b.dataset.share, text = shareText(), url = shareUrl(cur);
  if (via === 'close') { $('share').hidden = true; return; }
  track('share', { kind: cur, via });
  if (via === 'native') {
    try {
      const blob = await cardBlob(), file = blob && new File([blob], 'nishio-go.png', { type: 'image/png' });
      if (file && navigator.canShare && navigator.canShare({ files: [file] })) await navigator.share({ files: [file], text: `${text}\n${url}` });
      else await navigator.share({ text, url });
    } catch (err) { /* とじた */ }
  } else if (via === 'copy') {
    try { await navigator.clipboard.writeText(`${text}\n${url}`); G.toast('🔗 シェアの文とリンクをコピーしました'); } catch (err) { G.toast('コピーできませんでした。文を長押ししてコピーしてください'); }
  } else if (via === 'image') {
    const blob = await cardBlob();
    if (!blob) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'nishio-go.png'; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }
});
$('shareLogBtn').addEventListener('click', () => openShare('log'));
document.addEventListener('click', e => { const b = e.target.closest && e.target.closest('[data-share-open]'); if (b) openShare(b.dataset.shareOpen); });
// スポットの窓の「📣 シェア」・こえ タブの反映されたおたより の「📣 シェア」
document.addEventListener('click', e => {
  const b = e.target.closest && e.target.closest('[data-share-spot],[data-share-voice]');
  if (!b) return;
  if (b.dataset.shareSpot) { const s = (G.spots || []).find(x => x.id === b.dataset.shareSpot); if (s) openShare('spot', { spot: s }); }
  else openShare('voice', { voice: b.dataset.shareVoice });
});
G.openShare = openShare;
})();
