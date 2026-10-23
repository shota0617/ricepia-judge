// にしおさんぽGO のアクセス解析と広告の効果測定（ricepia.jp と同じタグ）
// - 送るのは「どの画面を見たか・どのボタンを押したか」だけ。現在地の座標は送らない
// - 公開しているドメインでだけ動く（手元の確認やプレイ確認の台本では動かない）
// - 「せってい」でオフにできる（localStorage の nsg_noanalytics）
// 使い方：nsgTrack('イベント名', { パラメータ })
(() => {
  const CFG = {
    hosts: ['go.ricepia.jp', 'ricepia-judge.vercel.app'],
    ga4: 'G-3R0SBHBEW4',            // Google アナリティクス（ricepia.jp と同じプロパティ）
    ads: 'AW-18316764348',          // Google 広告
    adsGameStart: '',               // Google 広告のコンバージョン「にしおさんぽGO ゲーム開始」のラベル（tools/google-ads-game-campaign-2026-10.js のログに出る）
    line: '6f0ea051-6c40-4f88-aee0-0779b6592add',   // LINEヤフー広告 計測タグ
    meta: '',                       // Meta ピクセル（データセットID）。決まったらここに入れる
  };
  let off = false;
  try { off = localStorage.getItem('nsg_noanalytics') === '1'; } catch (e) { /* noop */ }
  const on = !off && CFG.hosts.includes(location.hostname);
  const queue = [];
  window.nsgTrack = (name, params = {}) => {
    if (!on) return;
    try {
      window.gtag && gtag('event', name, params);
      // ゲーム専用キャンペーンは、遊び始めた数で入札する
      if (name === 'game_start' && CFG.adsGameStart && window.gtag) gtag('event', 'conversion', { send_to: `${CFG.ads}/${CFG.adsGameStart}` });
      if (window.fbq) {
        // 当店の LINE・サイト・道案内へ進んだら「見込み客」、それ以外はカスタムイベント
        if (name === 'shop_link' || name === 'shop_checkin' || name === 'line_add') fbq('track', 'Lead', params);
        else fbq('trackCustom', name, params);
      }
    } catch (e) { queue.push([name, params]); }
  };
  window.nsgAnalytics = { on, CFG };
  if (!on) return;

  const load = src => { const s = document.createElement('script'); s.async = true; s.src = src; document.head.appendChild(s); };
  // Google（アナリティクスと広告）。ricepia.jp と行き来しても同じ人として数えられるように linker を付ける
  window.dataLayer = window.dataLayer || [];
  window.gtag = function () { dataLayer.push(arguments); };
  gtag('js', new Date());
  gtag('config', CFG.ga4, { linker: { domains: ['ricepia.jp', 'go.ricepia.jp'] } });
  gtag('config', CFG.ads);
  load(`https://www.googletagmanager.com/gtag/js?id=${CFG.ga4}`);
  // LINEヤフー広告
  window.lyDataLayer = window.lyDataLayer || [];
  window.lytag = function () { lyDataLayer.push(Array.from(arguments)); };
  lytag({ type: 'init', tagId: CFG.line, config: { useCookie: true, useLocalStorage: true } });
  lytag({ type: 'event', eventType: 'page_view', tagId: CFG.line });
  load('https://tag.flvcdn.net/lytag.js');
  // Meta ピクセル（IDが入っているときだけ）
  if (CFG.meta) {
    !function (f, b, e, v, n, t, s) { if (f.fbq) return; n = f.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments); }; if (!f._fbq) f._fbq = n; n.push = n; n.loaded = !0; n.version = '2.0'; n.queue = []; t = b.createElement(e); t.async = !0; t.src = v; s = b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t, s); }(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');
    fbq('init', CFG.meta);
    fbq('track', 'PageView');
  }
  queue.splice(0).forEach(([n, p]) => window.nsgTrack(n, p));

  // 当店の LINE・サイト・道案内のリンクを押したら記録（ポップアップ・はじめの画面・ドット絵のウィンドウのどれでも）
  document.addEventListener('click', e => {
    const a = e.target.closest && e.target.closest('a[href]');
    if (!a) return;
    if (/lin\.ee\//.test(a.href)) {   // 当店の LINE の友だち追加：ricepia.jp と同じ広告の成果（LINE友だち追加クリック）にも数える
      window.nsgTrack('line_add', { from: (a.href.match(/from=([\w-]+)/) || [])[1] || '', transport_type: 'beacon' });
      if (window.gtag) gtag('event', 'conversion', { send_to: `${CFG.ads}/_h7ZCO-av9gcELzJjp5E`, transport_type: 'beacon' });
      return;
    }
    if (/ricepia\.jp/.test(a.href)) window.nsgTrack('shop_link', { link: 'site', transport_type: 'beacon' });
    else if (/google\.com\/maps\/dir/.test(a.href) && a.closest('.shop-links')) window.nsgTrack('shop_link', { link: 'directions', transport_type: 'beacon' });
  }, true);
})();
