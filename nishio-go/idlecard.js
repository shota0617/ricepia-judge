/* 手が止まったら、穏やかに「お疲れ様です」のカードを出して、サイトへ戻れるようにする（第4弾サイクル90）。
   Coffee Talk の物差し: 急かさず、引き止めず、話が終われば客は自然に店を出る。いいねは任意で、押さなくても何も失わない。 */
(function () {
  'use strict';
  var IDLE_CARD_SEC = 45;   // 眺めるコロコロ（8秒）より十分長い＝「遊びを終えた」とみなす無操作

  function shouldShow(s) {
    if (!s || typeof s !== 'object') return false;
    var n = Number(s.idleSec);
    return isFinite(n) && n >= IDLE_CARD_SEC &&
      s.moved === true && s.started === true && s.visible === true && s.covered === false && s.shown === false;
  }

  var shown = false, liked = false, lastAct = Date.now();

  function track(name) {
    try { if (typeof window.nsgTrack === 'function') window.nsgTrack(name, {}); } catch (e) { /* 計測は失敗しても遊びに関係しない */ }
  }
  function $(id) { return document.getElementById(id); }
  function open(el) { return el && !el.hidden; }

  function covered() {
    var ids = ['howto', 'share', 'coupon', 'pxInfo'];
    for (var i = 0; i < ids.length; i++) if (open($(ids[i]))) return true;
    var ps = document.querySelectorAll('.panel');
    for (var j = 0; j < ps.length; j++) if (!ps[j].hidden) return true;
    return false;
  }

  function hide() {
    var c = $('idleCard');
    if (!c || c.hidden) return;
    c.classList.remove('on');
    c.hidden = true;
  }

  function show() {
    var c = $('idleCard');
    if (!c) return;
    shown = true;
    c.hidden = false;
    window.requestAnimationFrame(function () { if (!c.hidden) c.classList.add('on'); });
    track('idle_card_show');
  }

  function act(e) {
    var c = $('idleCard');
    if (e && c && c.contains(e.target)) return;   // カードの中の操作では隠さない（ボタンを押せるように）
    lastAct = Date.now();
    shown = false;
    hide();
  }

  function tick() {
    var intro = $('intro');
    var idleSec = (Date.now() - lastAct) / 1000;
    if (open($('idleCard')) && (covered() || document.hidden)) { hide(); return; }
    if (shouldShow({
      idleSec: idleSec,
      moved: window.nsgHandMoved === true,
      started: !!intro && intro.hidden,
      visible: !document.hidden,
      covered: covered(),
      shown: shown
    })) show();
  }

  function init() {
    ['pointerdown', 'keydown', 'wheel', 'touchstart'].forEach(function (t) {
      document.addEventListener(t, act, { capture: true, passive: true });
    });
    var like = $('idleLike'), site = $('idleSite'), keep = $('idleKeep');
    if (like) like.addEventListener('click', function () {
      if (liked) return;
      liked = true;
      like.disabled = true;
      like.textContent = '♥ ありがとう';
      track('idle_card_like');
    });
    if (site) site.addEventListener('click', function () { track('idle_card_site'); });
    if (keep) keep.addEventListener('click', function () { lastAct = Date.now(); shown = false; hide(); });
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) { lastAct = Date.now(); shown = false; hide(); }   // 離れていた時間は無操作に数えない（Codexレビュー）。戻ってから45秒で改めて出せる
    });
    setInterval(tick, 1000);
  }

  window.NISHIO_IDLE_CARD = {
    IDLE_CARD_SEC: IDLE_CARD_SEC,
    shouldShow: shouldShow,
    state: function () { return { moved: window.nsgHandMoved === true, shown: shown, liked: liked, idleSec: Math.floor((Date.now() - lastAct) / 1000) }; }
  };

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
  }
})();
