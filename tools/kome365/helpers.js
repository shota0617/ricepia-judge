// 米作り365：check.js・playtest.js で 共通の ページ内の 道具（本物の タッチを #cv に 送る）
//   const { HELPERS } = require('./helpers'); await page.evaluate(HELPERS);
//   swipe(dir, len, fast, andFlush)：dir は 'up'|'down'|'left'|'right'、len は px、fast は はじく（3コマ）、ゆっくりは 24コマ（0.4秒）。andFlush で めくりの 列が 終わるまで 待つ
const HELPERS = () => {
  window.ev = (t, id, x, y) => document.getElementById('cv').dispatchEvent(new PointerEvent(t, { pointerId:id, pointerType:'touch', clientX:x, clientY:y, bubbles:true, button:0, isPrimary:true }));
  window.steps = n => { for (let i=0;i<n;i++) K3.step(1/60); };
  window.flush = () => { for (let i=0;i<400 && K3.V.flipQueue > 0;i++) K3.step(1/30); };
  window.swipe = (dir, len, fast, andFlush, id) => {
    const W = innerWidth, H = innerHeight, cx = W/2, cy = H*0.5; const dx = dir==='right'?1:dir==='left'?-1:0, dy = dir==='down'?1:dir==='up'?-1:0;
    const n = fast ? 3 : 24, pid = id || 1; ev('pointerdown', pid, cx - dx*len/2, cy - dy*len/2);
    for (let i=1;i<=n;i++){ ev('pointermove', pid, cx - dx*len/2 + dx*len*i/n, cy - dy*len/2 + dy*len*i/n); K3.step(1/60); }
    ev('pointerup', pid, cx + dx*len/2, cy + dy*len/2); K3.step(1/60);
    if (andFlush) flush();
  };
};
module.exports = { HELPERS };
