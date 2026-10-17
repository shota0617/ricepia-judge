// にしおさんぽGO の宣伝まわり：シェア（SNS・LINE・画像）と、広告・QR・シェアから来た人の受けとり
// ・シェアのリンクには UTM（utm_source=share）を付けて、シェアから来た人を数えられるようにする
// ・シェア用の画像（1200×630）は、その人のきろく（レベル・めぐった名所・米袋）と当店の名前をのせて、その場で描く（どこにも送らない）
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
if (Object.keys(land).length) {
  track('landing', land);
  if (land.c) track('campaign_landing', { campaign: land.c });
  if (land.play === '1' && document.getElementById('intro') && !document.getElementById('intro').hidden) G.begin(true);   // 広告から「操作して遊ぶ」ですぐ始める
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
const shareUrl = kind => `${SITE}?utm_source=share&utm_medium=social&utm_campaign=${encodeURIComponent(kind)}`;
function shareText(kind) {
  const s = G.stats();
  const head = kind === 'rice' ? `米袋が${s.kg}kgになったよ🌾` : `Lv${s.lv}「${s.title}」になったよ🚶`;
  return `にしおさんぽGOで西尾のまちを歩いて、${head}\nめぐった名所 ${s.places}か所・話した人 ${s.met}人・米袋 ${s.kg}kg\n#にしおさんぽGO #西尾市 #らいすぴあ`;
}
// シェア用の画像：空と田んぼ（こよみの季節の色）の上に、きろくと当店の名前
const logo = new Image();
logo.src = 'nishio-go/logo.svg';
function drawCard(kind) {
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
  const big = kind === 'rice' ? `🌾 米袋 ${s.kg}kg 達成！` : `🚶 Lv${s.lv}「${s.title}」`;
  x.textAlign = 'left'; x.textBaseline = 'alphabetic';
  x.font = 'bold 66px "DotGothic16", sans-serif'; x.lineWidth = 10; x.strokeStyle = '#fff'; x.fillStyle = '#2b2b2b';
  x.strokeText(big, 40, 240); x.fillText(big, 40, 240);
  x.font = '36px "DotGothic16", sans-serif'; x.lineWidth = 8;
  const sub = `めぐった名所 ${s.places}か所 ・ 話した人 ${s.met}人 ・ ${s.points.toLocaleString()}pt`;
  x.strokeText(sub, 40, 310); x.fillText(sub, 40, 310);
  const season = KO ? KO.line(new Date()) : '';
  x.font = '30px "DotGothic16", sans-serif'; x.strokeText(season, 40, 362); x.fillText(season, 40, 362);
  x.fillStyle = 'rgba(0,0,0,.78)'; x.fillRect(0, H - 70, W, 70);
  x.fillStyle = '#fff'; x.font = '30px "DotGothic16", sans-serif';
  x.fillText('西尾のお米屋さん 近藤米穀店・らいすぴあ が つくったお散歩ゲーム', 30, H - 26);
  x.textAlign = 'right'; x.fillStyle = '#ffe27a'; x.fillText('go.ricepia.jp', W - 30, H - 26);
}
let cur = 'log';
function openShare(kind) {
  cur = kind;
  const text = shareText(kind), url = shareUrl(kind);
  drawCard(kind);
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
  const via = b.dataset.share, text = shareText(cur), url = shareUrl(cur);
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
G.openShare = openShare;
})();
