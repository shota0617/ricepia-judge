// にしおさんぽGO：歩く地図（1マス8m、128×128マスの区画）を、西尾市全体ぶん実際の地図データから作って
// nishio-go/chunks/区画.json に保存する。ゲームはまずこのファイルを読み、なければブラウザで地図データを取る。
// GitHub Actions（.github/workflows/bake-chunks.yml）で動かす。ゲームと同じ pixel.js の rasterize() を使うので、
// 見た目はブラウザで作ったときと同じ。地図データは2×2区画（約2km四方）ずつまとめて取る。
//   使い方: npm install --no-save playwright && npx playwright install chromium && node tools/bake-chunks.js
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const { ROOT, startServer, openBakePage } = require('./bake-common');
const OUT = path.join(ROOT, 'nishio-go', 'chunks'), PORT = 8798, BLOCK = 2;
const srv = startServer(PORT);
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch();
  const { ctx, page } = await openBakePage(browser, PORT);
  // 西尾市の範囲にかかる区画（ゲームの ensureChunk と同じ判定）
  const list = await page.evaluate(() => {
    const P = nishioPixel, nb = nishioGo.CFG.nishioBounds, out = [];
    const a = P.toTile(nb[1][0] + 0.01, nb[0][1] - 0.01), b = P.toTile(nb[0][0] - 0.01, nb[1][1] + 0.01);
    for (let cy = Math.floor(a.y / P.CHUNK); cy <= Math.floor(b.y / P.CHUNK); cy++)
      for (let cx = Math.floor(a.x / P.CHUNK); cx <= Math.floor(b.x / P.CHUNK); cx++) {
        const bx = P.chunkBox(cx, cy);
        if (bx.n < nb[0][0] - 0.01 || bx.s > nb[1][0] + 0.01 || bx.e < nb[0][1] - 0.01 || bx.w > nb[1][1] + 0.01) continue;
        out.push([cx, cy]);
      }
    return out;
  });
  const blocks = new Map();
  for (const [cx, cy] of list) {
    const k = Math.floor(cx / BLOCK) + '_' + Math.floor(cy / BLOCK);
    if (!blocks.has(k)) blocks.set(k, []);
    blocks.get(k).push([cx, cy]);
  }
  console.log(`区画 ${list.length} 個、問い合わせ ${blocks.size} 回`);
  fs.mkdirSync(OUT, { recursive: true });
  const t0 = Date.now();
  let saved = 0, sea = 0, failed = 0, n = 0;
  for (const [bk, cs] of blocks) {
    n++;
    let res = null;
    for (let tries = 1; tries <= 4 && !res; tries++) {
      res = await page.evaluate(async cs => {
        const P = nishioPixel, C = P.C;
        const boxes = cs.map(([cx, cy]) => P.chunkBox(cx, cy));
        const b = { s: Math.min(...boxes.map(x => x.s)), w: Math.min(...boxes.map(x => x.w)), n: Math.max(...boxes.map(x => x.n)), e: Math.max(...boxes.map(x => x.e)) };
        let json;
        try { json = await P.overpass(P.chunkQuery(b)); } catch (e) { return { error: e.message }; }
        const els = json.elements || [], out = [];
        for (const [cx, cy] of cs) {
          const dem = await P.demFor(cx, cy).catch(() => null);
          if (!dem || dem.partial) { out.push({ k: cx + '_' + cy, skip: 'dem' }); continue; }
          const g = P.rasterize(els, cx, cy, dem.h);
          let s = '', allSea = true;
          for (let i = 0; i < g.length;) {
            const v = g[i]; let j = i + 1;
            while (j < g.length && g[j] === v) j++;
            s += String.fromCharCode(48 + v) + (j - i).toString(36) + '.';
            if ((v & 31) !== C.A) allSea = false;
            i = j;
          }
          out.push({ k: cx + '_' + cy, d: s, p: g.pois || [], sea: allSea });
        }
        return { els: els.length, out };
      }, cs);
      if (res.error) { console.log(`  ブロック ${bk} ${tries}回目 失敗: ${res.error}`); res = null; await sleep(30000 * tries); }
    }
    if (!res) { failed += cs.length; continue; }
    for (const c of res.out) {
      if (c.skip) { failed++; continue; }
      fs.writeFileSync(path.join(OUT, c.k + '.json'), JSON.stringify({ v: 1, d: c.d, p: c.p }));
      saved++; if (c.sea) sea++;
    }
    console.log(`  [${n}/${blocks.size}] ${bk}: ${res.els} 件 → ${res.out.length} 区画（${Math.round((Date.now() - t0) / 60000)}分）`);
  }
  await ctx.close(); await browser.close(); srv.close();
  console.log(`保存 ${saved} 区画（うち海だけ ${sea}）、作れなかった ${failed} 区画`);
  fs.writeFileSync(path.join(OUT, 'README.md'), `# 歩く地図の区画データ\n\n\`tools/bake-chunks.js\` が OpenStreetMap（© OpenStreetMap contributors, ODbL）と国土地理院の標高タイルから作ったものです（${new Date().toISOString().slice(0, 10)}）。手で編集しないでください。\n`);
  // ほとんど作れなかったときは失敗にする（中途半端なデータでコミットしない）
  if (saved < list.length * 0.8) { console.error('作れなかった区画が多すぎるので失敗にする'); process.exit(1); }
})().catch(e => { console.error(e); process.exit(1); });
