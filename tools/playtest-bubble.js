// 実際の 吹き出し描画を Canvas で 検査する。古い フレーム時刻でも、出始めより 縮まない。
const fs = require('fs'), path = require('path');
async function runBubbleChecks(browser) {
  const source = fs.readFileSync(path.join(__dirname, '../nishio-go/pixel.js'), 'utf8');
  const start = source.indexOf('function drawRiceSay('), end = source.indexOf('\nfunction floatText(', start);
  const size = source.match(/const FLOAT_PX = (\d+)/);
  if (start < 0 || end < 0 || !size) throw new Error('吹き出しの 描画関数が 見つからない');
  const page = await browser.newPage();
  try {
    return await page.evaluate(({ code, size }) => {
      const samples = [], errors = [];
      for (const calm of [false, true]) for (const dpr of [1, 3]) {
        const cv = document.createElement('canvas'); cv.width = 600; cv.height = 500;
        const ctx = cv.getContext('2d'), bub = { t: 'てすと', at: 2000, until: 3400 };
        const draw = new Function('ctx', 'riceBub', 'calmMotion', 'FLOAT_PX', code + ';return drawRiceSay;')(ctx, bub, calm, size);
        const native = ctx.roundRect;
        let radius = null;
        ctx.roundRect = function (...args) { radius = args[4]; return native.apply(this, args); };
        const group = [];
        for (const age of [-1000, -220, 0, 120, 500, 1300, 1401]) {
          cv.width = 600; radius = null;
          let error = null;
          try { draw(600, 380, 16, bub.at + age, dpr); }
          catch (e) { error = e.message; errors.push({ calm, dpr, age, error }); }
          const pixels = ctx.getImageData(0, 0, cv.width, cv.height).data;
          let ink = 0; for (let i = 3; i < pixels.length; i += 4) ink += pixels[i];
          group.push({ age, radius, ink, error });
        }
        const at = group[2], full = group[4], fading = group[5], expired = group[6];
        const ok = group.every(s => !s.error) && group.slice(0, 2).every(s => s.radius === at.radius && s.ink === at.ink) &&
          at.radius > 0 && at.ink > 0 && full.radius >= at.radius && fading.ink > 0 && fading.ink < full.ink && expired.ink === 0 && expired.radius === null &&
          (!calm || group.slice(0, 6).every(s => s.radius === at.radius));
        samples.push({ calm, dpr, frames: group, ok });
      }
      return { samples, errors, ok: !errors.length && samples.every(s => s.ok) };
    }, { code: source.slice(start, end), size: Number(size[1]) });
  } finally { await page.close(); }
}
module.exports = { runBubbleChecks };
if (require.main === module) (async () => {
  const { chromium } = require('playwright'), browser = await chromium.launch({ executablePath: process.env.CHROMIUM });
  try { const r = await runBubbleChecks(browser); console.log(JSON.stringify(r, null, 2)); process.exitCode = r.ok ? 0 : 1; }
  finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
