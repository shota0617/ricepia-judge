// にしおさんぽGO：歩く地図（1マス8m、128×128マスの区画）を、遊べる範囲（西尾市と となりの市町）ぶん実際の地図データから作って
// nishio-go/chunks/区画.json に保存する。ゲームはまずこのファイルを読み、なければブラウザで地図データを取る。
// GitHub Actions（.github/workflows/bake-chunks.yml）で動かす。ゲームと同じ pixel.js の rasterize() を使うので、
// 見た目はブラウザで作ったときと同じ。地図データは2×2区画（約2km四方）ずつまとめて取る。
//   使い方: npm install --no-save playwright && npx playwright install chromium && node tools/bake-chunks.js
//   ふだんは まだファイルのない区画だけ作る。全部作り直すときは BAKE_ALL=1（見た目の作り方を変えたとき）
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const { ROOT, startServer, openBakePage } = require('./bake-common');
const OUT = path.join(ROOT, 'nishio-go', 'chunks'), PORT = 8798, BLOCK = 2;
const srv = startServer(PORT);
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch();
  const { ctx, page } = await openBakePage(browser, PORT);
  // 遊べる範囲（西尾市と となりの市町）にかかる区画（ゲームの ensureChunk と同じ判定）
  const all = await page.evaluate(() => {
    const P = nishioPixel, pb = nishioGo.playBounds, out = [];
    const a = P.toTile(pb[1][0] + 0.01, pb[0][1] - 0.01), b = P.toTile(pb[0][0] - 0.01, pb[1][1] + 0.01);
    for (let cy = Math.floor(a.y / P.CHUNK); cy <= Math.floor(b.y / P.CHUNK); cy++)
      for (let cx = Math.floor(a.x / P.CHUNK); cx <= Math.floor(b.x / P.CHUNK); cx++)
        if (P.chunkInPlay(cx, cy)) out.push([cx, cy]);
    return out;
  });
  // ふだんは まだ作っていない区画だけ作る（BAKE_ALL=1 のときは全部作り直す）。範囲の外になった古い区画は消す
  const want = new Set(all.map(([cx, cy]) => cx + '_' + cy));
  for (const f of fs.existsSync(OUT) ? fs.readdirSync(OUT) : []) if (/^-?\d+_-?\d+\.json$/.test(f) && !want.has(f.slice(0, -5))) fs.rmSync(path.join(OUT, f));
  const list = process.env.BAKE_ALL === '1' ? all : all.filter(([cx, cy]) => !fs.existsSync(path.join(OUT, cx + '_' + cy + '.json')));
  console.log(`遊べる範囲の区画 ${all.length} 個のうち、作るのは ${list.length} 個`);
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
  const budget = (Number(process.env.BAKE_MINUTES) || 240) * 60000;   // Actions の時間切れの前に止めて、作った分だけコミットする（残りは次の実行で）
  let tried = 0;
  for (const [bk, cs] of blocks) {
    if (Date.now() - t0 > budget) { console.log(`時間の上限なので、残り ${blocks.size - n} ブロックは次の実行で作る`); break; }
    n++; tried += cs.length;
    let res = null;
    for (let tries = 1; tries <= 4 && !res; tries++) {
      res = await page.evaluate(async cs => {
        const P = nishioPixel, C = P.C;
        const boxes = cs.map(([cx, cy]) => P.chunkBox(cx, cy));
        const b = { s: Math.min(...boxes.map(x => x.s)), w: Math.min(...boxes.map(x => x.w)), n: Math.max(...boxes.map(x => x.n)), e: Math.max(...boxes.map(x => x.e)) };
        let json;
        try { json = await P.overpass(P.chunkQuery(b)); } catch (e) { return { error: e.message }; }
        const els = json.elements || [], out = [];
        // 海岸線は「その区画に重なるもの」だけを渡す（1区画ずつ問い合わせたときと同じにする）。
        // ほかの区画の海岸線が混ざると、rasterize() が「海岸線のある区画」とみなして、海だけの区画を陸にしてしまう
        const isCoast = el => el.tags && el.tags.natural === 'coastline';
        // 線分が（少し広げた）区画の長方形を本当に通るか（Liang–Barsky の線分クリッピング）
        const segHits = (q, r, x0, y0, x1, y1) => {
          const dx = r.lon - q.lon, dy = r.lat - q.lat;
          let t0 = 0, t1 = 1;
          for (const [p, d] of [[-dx, q.lon - x0], [dx, x1 - q.lon], [-dy, q.lat - y0], [dy, y1 - q.lat]]) {
            if (p === 0) { if (d < 0) return false; continue; }
            const t = d / p;
            if (p < 0) { if (t > t1) return false; if (t > t0) t0 = t; } else { if (t < t0) return false; if (t < t1) t1 = t; }
          }
          return true;
        };
        const crosses = (el, bx, pad) => {
          const g = el.geometry || [];
          if (g.length === 1) return segHits(g[0], g[0], bx.w - pad, bx.s - pad, bx.e + pad, bx.n + pad);
          for (let i = 0; i + 1 < g.length; i++) if (segHits(g[i], g[i + 1], bx.w - pad, bx.s - pad, bx.e + pad, bx.n + pad)) return true;
          return false;
        };
        for (const [cx, cy] of cs) {
          let dem = null;
          for (let t = 0; t < 3 && !(dem && !dem.partial); t++) {   // 標高タイルの一時的な失敗は取り直す
            if (t) await new Promise(r => setTimeout(r, 5000));
            dem = await P.demFor(cx, cy).catch(() => null);
          }
          if (!dem || dem.partial) { out.push({ k: cx + '_' + cy, skip: 'dem' }); continue; }
          const bx = P.chunkBox(cx, cy);
          const mine = els.filter(el => !isCoast(el) || crosses(el, bx, 0.0005));
          const g = P.rasterize(mine, cx, cy, dem.h);
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
    // 作れなかった区画は、前に作ったファイルが残っていれば消す（古いデータより、ブラウザで作るほうがよい）
    const drop = k => fs.rmSync(path.join(OUT, k + '.json'), { force: true });
    if (!res) { failed += cs.length; cs.forEach(([cx, cy]) => drop(cx + '_' + cy)); continue; }
    for (const c of res.out) {
      if (c.skip) { failed++; drop(c.k); continue; }
      fs.writeFileSync(path.join(OUT, c.k + '.json'), JSON.stringify({ v: 1, d: c.d, p: c.p }));
      saved++; if (c.sea) sea++;
    }
    console.log(`  [${n}/${blocks.size}] ${bk}: ${res.els} 件 → ${res.out.length} 区画（${Math.round((Date.now() - t0) / 60000)}分）`);
  }
  await ctx.close(); await browser.close(); srv.close();
  console.log(`保存 ${saved} 区画（うち海だけ ${sea}）、作れなかった ${failed} 区画`);
  if (saved) fs.writeFileSync(path.join(OUT, 'README.md'), `# 歩く地図の区画データ\n\n\`tools/bake-chunks.js\` が OpenStreetMap（© OpenStreetMap contributors, ODbL）と国土地理院の標高タイルから作ったものです（${new Date().toISOString().slice(0, 10)}）。手で編集しないでください。\n`);
  // ほとんど作れなかったときは失敗にする（中途半端なデータでコミットしない）
  if (saved < tried * 0.8) { console.error('作れなかった区画が多すぎるので失敗にする'); process.exit(1); }
})().catch(e => { console.error(e); process.exit(1); });
