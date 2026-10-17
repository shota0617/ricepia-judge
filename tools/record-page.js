// ページの動画を、きれいな解像度で録る（tools/make-reel.js・make-promo.js で使う）
// Playwright の recordVideo は CSS ピクセルの大きさ（360×640 など）でしか録れず、1080×1920 を指定しても左上に小さく入るだけになる。
// そこで Chrome（CDP）の スクリーンショットを scale 倍で撮りつづけ（2倍で毎秒18枚ほど）、撮った時刻どおりに ffmpeg でつなぐ。
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');

// 録りはじめる。戻り値の stop() を呼ぶと止まり、{ list（ffmpeg の concat 用ファイル）, duration（秒） } を返す
async function recordPage(page, dir, { scale = 2, quality = 88 } = {}) {
  fs.mkdirSync(dir, { recursive: true });
  const cdp = await page.context().newCDPSession(page), vp = page.viewportSize(), frames = [];
  let on = true;
  const loop = (async () => {
    while (on) {
      const t = Date.now();
      const r = await cdp.send('Page.captureScreenshot', { format: 'jpeg', quality, optimizeForSpeed: true, clip: { x: 0, y: 0, width: vp.width, height: vp.height, scale } }).catch(() => null);
      if (!r) { await new Promise(res => setTimeout(res, 50)); continue; }
      const f = path.join(dir, `f${String(frames.length).padStart(5, '0')}.jpg`);
      fs.writeFileSync(f, Buffer.from(r.data, 'base64'));
      frames.push({ f, t });
    }
  })();
  return async function stop() {
    on = false; await loop;
    if (!frames.length) throw new Error('動画のこまが撮れませんでした');
    // 1こまずつ、次のこまを撮るまでの長さだけ出す（concat の決まりで、最後のこまは2回書く）
    const lines = ['ffconcat version 1.0'];
    frames.forEach((fr, i) => { lines.push(`file '${path.basename(fr.f)}'`, `duration ${(((frames[i + 1] || { t: fr.t + 100 }).t - fr.t) / 1000).toFixed(3)}`); });
    lines.push(`file '${path.basename(frames[frames.length - 1].f)}'`);
    const list = path.join(dir, 'frames.txt');
    fs.writeFileSync(list, lines.join('\n') + '\n');
    return { list, duration: (frames[frames.length - 1].t - frames[0].t) / 1000 + 0.1 };
  };
}
// つないで mp4（H.264・30fps・1080×1920）にする。audio を渡すと、くり返して長さに合わせ、最初と最後を小さくしてのせる
function toMp4({ list, duration }, out, { audio = null, width = 1080, height = 1920 } = {}) {
  const args = ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', list];
  if (audio) args.push('-stream_loop', '-1', '-i', audio, '-map', '0:v', '-map', '1:a', '-t', duration.toFixed(2),
    '-af', `volume=0.8,afade=t=in:d=0.5,afade=t=out:st=${Math.max(0, duration - 2).toFixed(2)}:d=2`, '-c:a', 'aac', '-b:a', '160k');
  else args.push('-an');
  args.push('-vf', `scale=${width}:${height}:flags=lanczos,fps=30,format=yuv420p`, '-c:v', 'libx264', '-preset', 'slow', '-crf', '20', '-movflags', '+faststart', out);
  execFileSync('ffmpeg', args);
}
module.exports = { recordPage, toMp4 };
