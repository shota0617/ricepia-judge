// にしおさんぽGO：歩く地図（1マス8m、128×128マスの区画）を、遊べる範囲（西尾市と となりの市町）ぶん実際の地図データから作って
// nishio-go/chunks/区画.json に保存する。ゲームはまずこのファイルを読み、なければブラウザで地図データを取る。
// GitHub Actions（.github/workflows/bake-chunks.yml）で動かす。ゲームと同じ pixel.js の rasterize() を使うので、
// 見た目はブラウザで作ったときと同じ。地図データは2×2区画（約2km四方）ずつまとめて取る。
//   使い方: npm install --no-save playwright && npx playwright install chromium && node tools/bake-chunks.js
//   ふだんは まだファイルのない区画と、tools/chunks-version.txt の版が古い区画だけ作る（見た目の作り方を変えたら版を上げる）。
//   1回の実行は BAKE_MINUTES（既定240分）まで。残りは次の実行で作る。BAKE_ALL=1 なら全部作り直す
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const { ROOT, startServer, openBakePage } = require('./bake-common');
const { buildingsIn } = require('./gsi-buildings');   // 国土地理院の建物と、空中写真で見た屋根の色
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
  // 範囲の外になった古い区画は消す
  const want = new Set(all.map(([cx, cy]) => cx + '_' + cy));
  for (const f of fs.existsSync(OUT) ? fs.readdirSync(OUT) : []) if (/^-?\d+_-?\d+\.json$/.test(f) && !want.has(f.slice(0, -5))) fs.rmSync(path.join(OUT, f));
  // 作り直す区画：ファイルがない区画と、作ったときの版（cv。なければ1）が tools/chunks-version.txt と違う区画
  const CV = Number(fs.readFileSync(path.join(ROOT, 'tools', 'chunks-version.txt'), 'utf8').trim()) || 1;
  const stale = ([cx, cy]) => { try { return (JSON.parse(fs.readFileSync(path.join(OUT, cx + '_' + cy + '.json'), 'utf8')).cv || 1) !== CV; } catch (e) { return true; } };
  // BAKE_ONLY="cx_cy,cx_cy" なら、その区画だけ作る（見た目を確かめるとき）
  const only = new Set(String(process.env.BAKE_ONLY || '').split(/[,\s]+/).filter(Boolean));
  const list = only.size ? all.filter(([cx, cy]) => only.has(cx + '_' + cy)) : process.env.BAKE_ALL === '1' ? all : all.filter(stale);
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
  let tried = 0, stopped = false;
  for (const [bk, cs] of blocks) {
    if (Date.now() - t0 > budget) { console.log(`時間の上限なので、残り ${blocks.size - n} ブロックは次の実行で作る`); stopped = true; break; }
    n++; tried += cs.length;
    let res = null;
    for (let tries = 1; tries <= 4 && !res; tries++) {
      // 国土地理院の建物（ブロックの長方形＋少しの余白）。取れなければこのブロックは取り直す
      let bld;
      try {
        const bb = await page.evaluate(cs => { const b = cs.map(([cx, cy]) => nishioPixel.chunkBox(cx, cy)); return { s: Math.min(...b.map(x => x.s)), w: Math.min(...b.map(x => x.w)), n: Math.max(...b.map(x => x.n)), e: Math.max(...b.map(x => x.e)) }; }, cs);
        bld = await buildingsIn({ s: bb.s - 0.0003, w: bb.w - 0.0003, n: bb.n + 0.0003, e: bb.e + 0.0003 });
      } catch (e) { console.log(`  ブロック ${bk} ${tries}回目 建物が取れない: ${e.message}`); await sleep(30000 * tries); continue; }
      res = await page.evaluate(async ({ cs, bld }) => {
        const P = nishioPixel, C = P.C;
        await P.luReady;   // 土地利用の表（landuse.json）を読みおわってから塗る
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
          const near = bld.filter(b => b.r.some(([la, lo]) => la > bx.s - 0.0003 && la < bx.n + 0.0003 && lo > bx.w - 0.0003 && lo < bx.e + 0.0003));
          const g = P.rasterize(mine, cx, cy, dem.h, near);
          let s = '', allSea = true;
          for (let i = 0; i < g.length;) {
            const v = g[i]; let j = i + 1;
            while (j < g.length && g[j] === v) j++;
            s += String.fromCharCode(48 + v) + (j - i).toString(36) + '.';
            if ((v & 31) !== C.A) allSea = false;
            i = j;
          }
          let r = '';   // 屋根の色（同じランレングス）
          for (let i = 0; i < g.rf.length;) { const v = g.rf[i]; let j = i + 1; while (j < g.rf.length && g.rf[j] === v) j++; r += String.fromCharCode(48 + v) + (j - i).toString(36) + '.'; i = j; }
          out.push({ k: cx + '_' + cy, d: s, r, p: g.pois || [], sea: allSea, nb: near.length });
        }
        return { els: els.length, out };
      }, { cs, bld });
      if (res.error) { console.log(`  ブロック ${bk} ${tries}回目 失敗: ${res.error}`); res = null; await sleep(30000 * tries); }
    }
    // 作れなかった区画は、前に作ったファイルが残っていれば消す（古いデータより、ブラウザで作るほうがよい）
    const drop = k => fs.rmSync(path.join(OUT, k + '.json'), { force: true });
    if (!res) { failed += cs.length; cs.forEach(([cx, cy]) => drop(cx + '_' + cy)); continue; }
    for (const c of res.out) {
      if (c.skip) { failed++; drop(c.k); continue; }
      fs.writeFileSync(path.join(OUT, c.k + '.json'), JSON.stringify({ v: 1, cv: CV, d: c.d, r: c.r, p: c.p }));
      saved++; if (c.sea) sea++;
    }
    console.log(`  [${n}/${blocks.size}] ${bk}: ${res.els} 件・建物 ${res.out.reduce((a, c) => a + (c.nb || 0), 0)} → ${res.out.length} 区画（${Math.round((Date.now() - t0) / 60000)}分）`);
  }
  await ctx.close(); await browser.close(); srv.close();
  console.log(`保存 ${saved} 区画（うち海だけ ${sea}）、作れなかった ${failed} 区画`);
  if (saved) fs.writeFileSync(path.join(OUT, 'README.md'), `# 歩く地図の区画データ\n\n\`tools/bake-chunks.js\` が OpenStreetMap（© OpenStreetMap contributors, ODbL）と国土地理院の標高タイル・ベクトルタイル（建物）・全国最新写真（シームレス）、国土数値情報（土地利用細分メッシュデータ）（国土交通省）を加工して作ったものです（${new Date().toISOString().slice(0, 10)}）。手で編集しないでください。\n`);
  // ほとんど作れなかったときは失敗にする（中途半端なデータでコミットしない）
  if (saved < tried * 0.8) { console.error('作れなかった区画が多すぎるので失敗にする'); process.exit(1); }
  // 時間の上限で止めたときは、Actions に「続きがある」と知らせる（ワークフローがこの実行のコミットのあと、もう一度自分を起動する）
  if (stopped && saved && process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, 'more=1\n');
})().catch(e => { console.error(e); process.exit(1); });
