// にしおさんぽGO を AI（Claude Code など）が自分で操作して遊ぶための道具：node tools/ai-play.js <出力フォルダ> <手順.json | 手順のJSON>
// ・手順は「何をするか」の並び。1つ進めるごとに画面を撮り（<出力>/NN-なに.png）、そのときの様子（ポイント・話した人・行き先・開いている窓の文）を
//   <出力>/log.json に書く。AI は画像と log.json を見て、次の手順を考えて、また動かす（遊ぶ→見る→考える のくり返し）
// ・記録（localStorage）は <出力>/storage.json にとっておき、次に動かしたときは続きから遊べる（--reset ではじめから）
// ・手順の例：
//   [{"do":"start"}, {"do":"walk","dir":"up","n":5}, {"do":"goto","id":"f-nishio-station"}, {"do":"goto","id":"npc:station-student"},
//    {"do":"goto","id":"chest"}, {"do":"auto","sec":30}, {"do":"close"}, {"do":"tap","sel":"[data-tab=log]"}, {"do":"wait","ms":800}, {"do":"eval","js":"nishioGo.state.points"}]
//   start：「操作して遊ぶ」で始める／walkstart：「あるいて遊ぶ」で始める（位置情報。はじめは西尾駅の近く）／gps：位置を lat・lng へ／
//   gpswalk：位置を スポット・人（id に npc:id）・マス（tile:[x,y]）へ歩く速さで動かす（speed m/秒。fast で待ち時間を縮めると、速すぎて歩いた数に入らない）／
//   gps は lat・lng のかわりに tile:[x,y] でもよい／walk：矢印キーで n マス／goto：スポット・人（npc:id）・いちばん近いたからばこ まで道を探して歩く／
//   tilt：スマホを傾けて sec 秒 お米を転がす（x：左右・y：前後 -1〜1）／close：開いている窓とごほうびの画面を閉じる／tap：画面の部品を押す／click：画面の位置 x・y をタップ／key：キーを押す／eval：ページの中で式を計算して log に残す
// 環境変数：CHROMIUM・LEAFLET_DIR（tools/playtest.js と同じ）・PLAY_QUERY（ページにつける ?…。ed=city で西尾市版）・PLAY_DATE（日付を固定。省略時は今の時刻。固定すると時計が止まるので、おまかせ歩きの「少し休む」が終わらず歩かない。おまかせ歩きを見るときは付けない）
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const { startServer } = require('./bake-common');

const [OUT_ARG, PLAN_ARG] = process.argv.slice(2).filter(a => !a.startsWith('--'));
if (!OUT_ARG || !PLAN_ARG) { console.error('使いかた：node tools/ai-play.js <出力フォルダ> <手順.json | 手順のJSON> [--reset]'); process.exit(2); }
const OUT = path.resolve(OUT_ARG), RESET = process.argv.includes('--reset');
const PLAN = JSON.parse(fs.existsSync(PLAN_ARG) ? fs.readFileSync(PLAN_ARG, 'utf8') : PLAN_ARG);
const PORT = Number(process.env.PLAYTEST_PORT) || 8898, URL = `http://localhost:${PORT}/nishio-go.html${process.env.PLAY_QUERY ? '?' + process.env.PLAY_QUERY : ''}`;   // PLAY_QUERY=ed=city で西尾市版
const STORE = path.join(OUT, 'storage.json');

// いまの様子（AI が次の手を考えるための材料）
const look = page => page.evaluate(() => {
  const G = nishioGo, P = nishioPixel, txt = id => {   // 知らせ（toast）・ごほうび（reward）は position:fixed で offsetParent がないので、show が付いているかで見る
    const e = document.getElementById(id), on = e && !e.hidden && (id === 'toast' || id === 'reward' ? e.classList.contains('show') : e.offsetParent !== null);
    return on ? e.innerText.replace(/\s+/g, ' ').trim().slice(0, 300) : '';
  };
  const me = G.me, t = me && P.toTile(me.lat, me.lng);
  const near = me ? G.npcs.map(n => ({ id: n.id, name: n.name, m: Math.round(G.dist(me, n)), met: G.npcMet(n.id) })).sort((a, b) => a.m - b.m).slice(0, 3) : [];
  const spots = me ? G.spots.map(s => ({ id: s.id, name: s.name, m: Math.round(G.dist(me, s)), visited: !!G.state.visits[s.id] })).sort((a, b) => a.m - b.m).slice(0, 4) : [];
  return {
    pts: G.state.points, met: G.state.met.length, visits: Object.keys(G.state.visits).length, facts: G.state.facts.length,
    guide: G.guide ? `${G.guide.name}（${G.guide.kind}${G.guide.id ? ':' + G.guide.id : ''}）` : '', tile: t && [Math.floor(t.x), Math.floor(t.y)],
    info: txt('pxInfo'), toast: txt('toast'), reward: txt('reward'), status: txt('status'), near, spots,
  };
});

// 主人公から、スポット・人・たからばこ まで、ゲームと同じ通れるマスの決まりで道を探して、矢印キーの並びにする（tools/playtest.js の walkTo と同じ考え方）
const route = (page, id) => page.evaluate(id => {
  const G = nishioGo, P = nishioPixel, C = P.C, BL = new Set([C.A, C.B, C.M, C.X]), me = G.me;
  const a = P.toTile(me.lat, me.lng), sx = Math.floor(a.x), sy = Math.floor(a.y);
  let goal, reach;
  if (id === 'chest') {
    const c = G.liveChests().sort((p, q) => G.dist(me, p) - G.dist(me, q))[0];
    if (!c) return null;
    goal = P.toTile(c.lat, c.lng); reach = 1;
  } else if (id.startsWith('npc:')) {
    const n = G.npcs.find(x => x.id === id.slice(4));
    if (!n) return null;
    const q = P.npcTile(n); goal = { x: q.x + 0.5, y: q.y + 0.5 }; reach = 1.1;   // となりのマスまで行けば、最後の1歩でぶつかって話しかける
  } else {
    const s = G.spots.find(x => x.id === id);
    if (!s) return null;
    goal = P.toTile(s.lat, s.lng); reach = G.reachOf(s) * 0.7 / 8;
  }
  const D = [[0, -1, 'ArrowUp'], [0, 1, 'ArrowDown'], [-1, 0, 'ArrowLeft'], [1, 0, 'ArrowRight']];
  const prev = new Map([[sx + ',' + sy, null]]), q = [[sx, sy]];
  let end = null;
  while (q.length && prev.size < 300000) {
    const [x, y] = q.shift();
    if (Math.hypot(x + 0.5 - goal.x, y + 0.5 - goal.y) <= reach) { end = [x, y]; break; }
    for (const [dx, dy, k] of D) {
      const nx = x + dx, ny = y + dy, key = nx + ',' + ny;
      if (prev.has(key) || BL.has(P.codeAt(nx, ny) & 31)) continue;
      prev.set(key, [x + ',' + y, k]); q.push([nx, ny]);
    }
  }
  if (!end) return [];
  const keys = [];
  for (let cur = end[0] + ',' + end[1]; prev.get(cur); cur = prev.get(cur)[0]) keys.push(prev.get(cur)[1]);
  keys.reverse();
  if (id.startsWith('npc:')) { const n = P.npcTile(G.npcs.find(x => x.id === id.slice(4))); keys.push(n.x > end[0] ? 'ArrowRight' : n.x < end[0] ? 'ArrowLeft' : n.y > end[1] ? 'ArrowDown' : 'ArrowUp'); }
  return keys;
}, id);

// 矢印キーで歩く。呼びとめ・話・知らせなどで止められたら（動かなくなったら）、そこでやめる
async function keys(page, list) {
  let stuck = 0;
  for (const k of list) {
    const before = await page.evaluate(() => nishioGo.me && nishioGo.me.lat + ',' + nishioGo.me.lng);
    await page.keyboard.press(k); await page.waitForTimeout(140);
    const after = await page.evaluate(() => nishioGo.me && nishioGo.me.lat + ',' + nishioGo.me.lng);
    if (before === after && ++stuck >= 3) return false;
    if (before !== after) stuck = 0;
  }
  return true;
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const srv = startServer(PORT);
  const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
  // 位置情報は許可しておく（あるいて遊ぶ：はじめは名鉄 西尾駅の近く。gps・gpswalk で動かす）
  let here = { latitude: 34.8640, longitude: 137.0560, accuracy: 10 };
  const ctx = await browser.newContext({ viewport: { width: 390, height: 780 }, deviceScaleFactor: 2, permissions: ['geolocation'], geolocation: here });
  const saved = !RESET && fs.existsSync(STORE) ? fs.readFileSync(STORE, 'utf8') : null;
  await ctx.addInitScript(s => {
    if (sessionStorage.getItem('aiplay')) return;   // 読みこみ直したときは、ゲームが書いた記録のまま
    sessionStorage.setItem('aiplay', '1');
    if (s) { localStorage.clear(); for (const [k, v] of Object.entries(JSON.parse(s))) localStorage.setItem(k, v); }
    else { localStorage.setItem('nsg_auto', 'false'); localStorage.setItem('nsg_view', 'px'); localStorage.setItem('nsg_world_on', '0'); localStorage.setItem('nsg_roll', '0'); }   // walk の手順は1マスずつ（転がすのは eval で nishioPixel.setRoll(true)）
  }, saved);
  const page = await ctx.newPage();
  if (process.env.PLAY_DATE) await page.clock.setFixedTime(new Date(process.env.PLAY_DATE));
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  if (process.env.LEAFLET_DIR) await page.route('https://unpkg.com/**', r => {
    const f = r.request().url().endsWith('.css') ? 'leaflet.css' : 'leaflet.js';
    r.fulfill({ body: fs.readFileSync(path.join(process.env.LEAFLET_DIR, f)), contentType: f.endsWith('css') ? 'text/css' : 'text/javascript' });
  });
  await page.route(/^https:\/\/(cyberjapandata\.gsi\.go\.jp|fonts\.googleapis\.com|[^/]*overpass[^/]*)\//, r => r.fulfill({ status: 504, body: '' }));
  await page.goto(URL); await page.waitForTimeout(1000);
  const log = [];
  let i = 0;
  for (const a of PLAN) {
    i++;
    const r = { n: i, do: a };
    try {
      if (a.do === 'walkstart') {   // 「あるいて遊ぶ」で始める
        if (await page.isVisible('#startBtn')) { await page.click('#startBtn'); await page.waitForTimeout(2500); }
        else r.note = '「あるいて遊ぶ」が見つからない';
      } else if (a.do === 'gps') {
        const ll = a.tile ? await page.evaluate(t => nishioPixel.toLatLng(t[0] + 0.5, t[1] + 0.5), a.tile) : { lat: a.lat, lng: a.lng };
        here = { ...here, latitude: ll.lat, longitude: ll.lng }; await ctx.setGeolocation(here); await page.waitForTimeout(800);
      }
      else if (a.do === 'gpswalk') {   // 位置情報を、スポット・人（npc:id）へ まっすぐ歩く速さ（speed m/秒、ふつう1.4）で動かす。reach m 手前で止まる
        const to = a.tile ? await page.evaluate(t => nishioPixel.toLatLng(t[0] + 0.5, t[1] + 0.5), a.tile)
          : await page.evaluate(id => { const G = nishioGo, x = id.startsWith('npc:') ? G.npcs.find(n => n.id === id.slice(4)) : G.spots.find(s => s.id === id); return x && { lat: x.lat, lng: x.lng }; }, a.id);
        if (!to) r.note = 'そんな行き先はない';
        else {
          const sp = a.speed || 1.4, stop = a.reach == null ? 10 : a.reach, mlat = 111320, mlng = 111320 * Math.cos(to.lat * Math.PI / 180);
          for (let k = 0; k < 900; k++) {
            const dy = (to.lat - here.latitude) * mlat, dx = (to.lng - here.longitude) * mlng, d = Math.hypot(dx, dy);
            if (d <= stop) break;
            const f = Math.min(1, (sp * 2) / d);   // 2秒ごとに進める
            here = { ...here, latitude: here.latitude + (to.lat - here.latitude) * f, longitude: here.longitude + (to.lng - here.longitude) * f };
            await ctx.setGeolocation(here); await page.waitForTimeout(2000 / (a.fast || 1));
          }
          r.at = [here.latitude, here.longitude];
        }
      } else if (a.do === 'start') {
        if (await page.isVisible('#meiroBtn')) { await page.click('#meiroBtn'); await page.waitForTimeout(2500); }
        else if (!(await page.evaluate(() => nishioGo.demo))) r.note = '「操作して遊ぶ」が見つからない（あるいて移動のまま）';
      } else if (a.do === 'walk') r.moved = await keys(page, Array(a.n || 1).fill({ up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' }[a.dir]));
      else if (a.do === 'goto') {
        const k = await route(page, a.id);
        if (!k) r.note = 'そんな行き先はない';
        else if (!k.length) r.note = '道が見つからない';
        else { r.steps = k.length; r.arrived = await keys(page, k); }
        await page.waitForTimeout(600);
      } else if (a.do === 'tilt') {   // スマホを傾けたことにする（x：左右・y：前後。-1〜1。20度で1）。sec 秒のあいだ傾けて、お米を転がす
        await page.evaluate(() => { nishioPixel.setRoll(true); for (let i = 0; i < 10; i++) window.dispatchEvent(new DeviceOrientationEvent('deviceorientation', { alpha: 0, beta: 40, gamma: 0 })); });
        const end = Date.now() + (a.sec || 1) * 1000;
        while (Date.now() < end) { await page.evaluate(([x, y]) => window.dispatchEvent(new DeviceOrientationEvent('deviceorientation', { alpha: 0, beta: 40 + y * 20, gamma: x * 20 })), [a.x || 0, a.y || 0]); await page.waitForTimeout(50); }
        await page.evaluate(() => window.dispatchEvent(new DeviceOrientationEvent('deviceorientation', { alpha: 0, beta: 40, gamma: 0 })));
        await page.waitForTimeout(800);
        r.roll = await page.evaluate(() => nishioPixel.roll);
      } else if (a.do === 'close') await page.evaluate(() => {   // 人やスポットの窓と、ごほうびの画面（タップで とじる）
        const b = document.querySelector('#pxInfo:not([hidden]) [data-close]'); if (b) b.click();
        const rw = document.getElementById('reward'); if (rw.classList.contains('show')) rw.click();
        if (window.NISHIO_MOVIE && NISHIO_MOVIE.playing) NISHIO_MOVIE.close();   // ドット絵ムービー（最後まで見ずに閉じると、まちメモ には残らない）
      });
      else if (a.do === 'tap') await page.click(a.sel, { timeout: 3000 });
      else if (a.do === 'click') await page.mouse.click(a.x, a.y);   // 画面の位置（CSS ピクセル。スクリーンショットは2倍なので、その半分）をタップ
      else if (a.do === 'key') await page.keyboard.press(a.key);
      else if (a.do === 'wait') await page.waitForTimeout(a.ms || 1000);
      else if (a.do === 'eval') r.value = await page.evaluate(a.js);
      else r.note = 'しらない手順';
    } catch (e) { r.error = e.message.split('\n')[0]; }
    await page.waitForTimeout(a.do === 'wait' ? 0 : 300);
    r.shot = `${String(i).padStart(2, '0')}-${String(a.do).replace(/[^a-z]/g, '')}.png`;   // 手順の名前は英字だけ（出力フォルダの外に書かない）
    await page.screenshot({ path: path.join(OUT, r.shot) });
    r.after = await look(page);
    log.push(r);
    console.log(JSON.stringify({ n: i, do: a.do, ...(r.note ? { note: r.note } : {}), ...(r.error ? { error: r.error } : {}), pts: r.after.pts, met: r.after.met, guide: r.after.guide, info: r.after.info.slice(0, 80) }));
  }
  fs.writeFileSync(STORE, JSON.stringify(await page.evaluate(() => Object.fromEntries(Object.entries(localStorage)))));
  fs.writeFileSync(path.join(OUT, 'log.json'), JSON.stringify({ errors, log }, null, 1));
  if (errors.length) console.log('ページのエラー：' + errors.join(' / '));
  await browser.close(); srv.close();
})().catch(e => { console.error(e); process.exit(1); });
