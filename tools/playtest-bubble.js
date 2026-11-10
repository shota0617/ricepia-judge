// お米の 吹き出しは 廃止（運営者の声 2026-11-02「しゃべらなくていい。吹き出し廃止」。nishio-go/pixel.js の riceSay・drawRiceSay）。
// 実際の 描画関数を Canvas で 動かして、どの フレーム時刻・動きの 設定・画面の 濃さでも 何も 描かず、エラーにも ならない ことを 確かめる。
// ことばは 持たない（riceBub は 間隔づくりの at・until だけ）。前は「出始めより 縮まない」を 見て いた
const fs = require('fs'), path = require('path');
async function runBubbleChecks(browser) {
  const source = fs.readFileSync(path.join(__dirname, '../nishio-go/pixel.js'), 'utf8');
  const start = source.indexOf('function drawRiceSay('), end = source.indexOf('\nfunction floatText(', start);
  const size = source.match(/const FLOAT_PX = (\d+)/);
  if (start < 0 || end < 0 || !size) throw new Error('吹き出しの 描画関数が 見つからない');
  const bub = source.match(/const riceBub = (\{[^}]*\});/), sayAt = source.indexOf('function riceSay('), say = sayAt < 0 ? '' : source.slice(sayAt, source.indexOf('\n}', sayAt));
  const noWords = !!bub && /^\{\s*at: 0, until: 0\s*\}$/.test(bub[1]) && !!say && !/riceBub\.t\b|\bt: t\b|\{ t,/.test(say);   // ことばを しまう 所が ない
  const page = await browser.newPage();
  try {
    return await page.evaluate(({ code, size, noWords }) => {
      const samples = [], errors = [];
      for (const calm of [false, true]) for (const dpr of [1, 3]) {
        const cv = document.createElement('canvas'); cv.width = 600; cv.height = 500;
        const ctx = cv.getContext('2d'), bub = { t: 'てすと', at: 2000, until: 3400 };
        const draw = new Function('ctx', 'riceBub', 'calmMotion', 'FLOAT_PX', code + '\n;return drawRiceSay;')(ctx, bub, calm, size);   // 取りだした 範囲の 最後の 行が // の コメントでも return が のまれない ように 行を かえる
        let calls = 0;
        for (const k of ['roundRect', 'fillText', 'strokeText', 'fillRect', 'fill', 'stroke', 'drawImage']) { const native = ctx[k]; ctx[k] = function (...args) { calls++; return native.apply(this, args); }; }
        const group = [];
        for (const age of [-1000, -220, 0, 120, 500, 1300, 1401]) {
          cv.width = 600; calls = 0;
          let error = null;
          try { draw(600, 380, 16, bub.at + age, dpr); }
          catch (e) { error = e.message; errors.push({ calm, dpr, age, error }); }
          const pixels = ctx.getImageData(0, 0, cv.width, cv.height).data;
          let ink = 0; for (let i = 3; i < pixels.length; i += 4) ink += pixels[i];
          group.push({ age, calls, ink, error });
        }
        const ok = typeof draw === 'function' && group.every(s => !s.error && s.ink === 0 && s.calls === 0);
        samples.push({ calm, dpr, frames: group, ok });
      }
      return { samples, errors, noWords, ok: !errors.length && noWords && samples.length === 4 && samples.every(s => s.ok) };
    }, { code: source.slice(start, end), size: Number(size[1]), noWords });
  } finally { await page.close(); }
}
module.exports = { runBubbleChecks };
if (require.main === module) (async () => {
  const { chromium } = require('playwright'), browser = await chromium.launch({ executablePath: process.env.CHROMIUM });
  try { const r = await runBubbleChecks(browser); console.log(JSON.stringify(r, null, 2)); process.exitCode = r.ok ? 0 : 1; }
  finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
