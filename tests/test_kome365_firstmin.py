"""米づくり365: 最初の1分に出る飾りが、カードの日付や天気の丸に重ならない置き方になっているか(周回152)、押しただけでは案内が消えないか(周回153)、出だしのちらつきと2Dの天気(周回154)、スワイプの手本(周回155)、止まったら手本(周回158)、飛んでいる間の指・しるしのあとの手本(周回161)、おそい回線・おそいスマホ(周回164)、田んぼから はじめた スワイプ(周回165)、しるしに 重なる 丸い ◀ ▶・点の列の さいごの 絵(周回166)、読みこみが 止まった ときの 知らせ・低い 縦の 画面の 天気(周回168)。"""
import json
import os
import re
import shutil
import subprocess
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HTML_PATH = os.environ.get("KOME365_HTML") or os.path.join(ROOT, "kome365", "index.html")
with open(HTML_PATH, encoding="utf-8") as f:
    HTML = f.read()

# 周回167: 指の 入口(cardDown・cardMove・up・pendFlush・田んぼの 入口)を index.html から 取り出し、にせの 画面で 本当に 動かす。
# 指の 道すじ(steps)を 流して、決まった 向き(chosen)・カードを 持って いる 指(holder)などを 返す
POINTER_JS = r"""
const fs = require('fs');
const html = fs.readFileSync(process.argv[1], 'utf8');
const a = html.indexOf("  var pend = null, cardDown = null, cardMove = null");
const endMark = "    cardDown(e);\n  });";
const b = html.indexOf(endMark, a);
if (a < 0 || b < 0) { console.log(JSON.stringify({ error: 'no code' })); process.exit(0); }
const code = html.slice(a, b + endMark.length);
const log = { chosen: [], markOff: 0, stops: 0, idleTouch: 0 };
function mkEl(id){ const cl = new Set(); return { id: id, style: { setProperty(){} }, offsetWidth: 360, classList: { add(){ for (const x of arguments) cl.add(x); }, remove(){ for (const x of arguments) { if (id === 'swMark' && x === 'on') log.markOff++; cl.delete(x); } }, contains(x){ return cl.has(x); }, toggle(x, v){ if (v) cl.add(x); else cl.delete(x); } }, _l: {}, addEventListener(t, fn){ (this._l[t] = this._l[t] || []).push(fn); }, setPointerCapture(p){ caught.add(p); }, releasePointerCapture(p){ caught.delete(p); } }; }
const caught = new Set();
const els = {}; const $ = id => els[id] || (els[id] = mkEl(id));
const el = { card: $('swCard') }; $('sGame').classList.add('swipeMode');
const docL = { cap: {}, bub: {} };
const document = { hidden: false, addEventListener(t, fn, c){ const k = (c === true || (c && c.capture)) ? 'cap' : 'bub'; (docL[k][t] = docL[k][t] || []).push(fn); } };
const winL = {};
const window = { innerWidth: 844, addEventListener(t, fn){ (winL[t] = winL[t] || []).push(fn); } };
let now = 1000, markAt = -1e9; const performance = { now: () => now };
let startX = null, startY = 0, dx = 0, dy = 0, samples = [], pid = null, busy = false, card = {}, f = {}, finger = null, use3d = null, dragMoves = 0, dragApplied = 0, tapOnly = 0;
const KomeCards = { over: () => false };
function evT(e){ return (e && typeof e.timeStamp === 'number' && e.timeStamp > 0) ? e.timeStamp : performance.now(); }
function fingerReady(){ return true; } function idleTouch(){ log.idleTouch++; } function greetClear(){} function ghostPause(){} function ghostBack(){ log.stops++; }
function cancelDragFrame(){} function queueDrag(){} function reset(){ dx = 0; dy = 0; } function festReset(){} function pvCompute(){}
function choose(side){ if (busy) return; busy = true; log.chosen.push(side); }
eval(code);
const SEL = { card: ['#swCard', '#swStage'], stage: ['#swStage'], field: [], idle: ['#swIdleLike, #swIdleHome', '#swIdle', 'button'], top: [] };
function fire(type, o){
  const kind = o.on || 'card';
  const e = { type: type, pointerId: o.id, clientX: o.x, clientY: o.y, timeStamp: o.t, button: o.button || 0, isPrimary: o.primary !== false, target: { id: kind === 'field' ? 'field' : '', closest(sel){ return SEL[kind].some(s => sel.split(',').map(x => x.trim()).some(p => s.split(',').map(x => x.trim()).indexOf(p) >= 0)) ? {} : null; } } };
  now = o.t;
  (docL.cap[type] || []).forEach(fn => fn(e));
  if (kind === 'card' || (type !== 'pointerdown' && caught.has(o.id))) (el.card._l[type] || []).forEach(fn => fn(e));   // カードに 届くのは、カードの 上の 指と、カードが つかまえた 指だけ
  if (type === 'pointerup' || type === 'pointercancel') caught.delete(o.id);
  (docL.bub[type] || []).forEach(fn => fn(e));
}
const steps = JSON.parse(process.argv[2]);
for (const s of steps) {
  if (s[0] === 'land') { busy = false; now = s[1]; pendFlush(); }
  else if (s[0] === 'resize') { window.innerWidth = s[1]; (winL.resize || []).forEach(fn => fn()); }
  else if (s[0] === 'hide') { document.hidden = true; (docL.bub.visibilitychange || []).forEach(fn => fn()); document.hidden = false; }
  else if (s[0] === '3d') use3d = true;
  else if (s[0] === 'mark') markAt = s[1];
  else fire('pointer' + s[0], s[1]);
}
console.log(JSON.stringify({ chosen: log.chosen, holder: startX != null ? pid : null, dx: dx, dragging: el.card.classList.contains('drag'), markOff: log.markOff, stops: log.stops, idleTouch: log.idleTouch, busy: busy }));
"""


def pointer_run(steps):
    node = shutil.which("node")
    if not node:
        raise unittest.SkipTest("node がないので実行の確認は飛ばす")
    out = subprocess.run([node, "-e", POINTER_JS, HTML_PATH, json.dumps(steps)], capture_output=True, text=True)
    if out.returncode != 0:
        raise AssertionError(out.stderr[-2000:])
    return json.loads(out.stdout.strip().splitlines()[-1])


def stroke(pid, x, y, dx, dy, t0, ms=110, on="card", primary=True, n=6, lift=True):
    """1本の 指の 動き: 置く → n 回 動かす → 離す"""
    o = [["down", {"id": pid, "x": x, "y": y, "t": t0, "on": on, "primary": primary}]]
    for i in range(1, n + 1):
        o.append(["move", {"id": pid, "x": x + dx * i / n, "y": y + dy * i / n, "t": t0 + ms * i / n, "on": on, "primary": primary}])
    if lift:
        o.append(["up", {"id": pid, "x": x + dx, "y": y + dy, "t": t0 + ms + 4, "on": on, "primary": primary}])
    return o


def pinch(t0, on="stage", gap=12, each=95, ms=350, y=330):
    """2本の 指を gap ミリ秒ずらして 置き、左右へ 開いて、2本とも 離す"""
    o = [["down", {"id": 1, "x": 170, "y": y, "t": t0, "on": on}], ["down", {"id": 2, "x": 220, "y": y, "t": t0 + gap, "on": on, "primary": False}]]
    for i in range(1, 9):
        t = t0 + gap + ms * i / 8
        o.append(["move", {"id": 1, "x": 170 - each * i / 8, "y": y, "t": t, "on": on}])
        o.append(["move", {"id": 2, "x": 220 + each * i / 8, "y": y, "t": t, "on": on, "primary": False}])
    o.append(["up", {"id": 1, "x": 170 - each, "y": y, "t": t0 + gap + ms + 20, "on": on}])
    o.append(["up", {"id": 2, "x": 220 + each, "y": y, "t": t0 + gap + ms + 20, "on": on, "primary": False}])
    return o


# 周回168: いちばん 上の インライン スクリプト(読みこみの 見はり)を index.html から 取り出し、にせの 時計・画面で 本当に 動かす。
# 場面(plan)の とおりに 時計を 進め、知らせ(#bootSlow)が 出て いるかを ミリ秒ごとに 返す
BOOT_JS = r"""
const fs = require('fs');
const html = fs.readFileSync(process.argv[1], 'utf8');
const a = html.indexOf('<script>'), b = html.indexOf('</script>', a);
const plan = JSON.parse(process.argv[2]);
let now = 0, timers = [], tid = 0, nodes = 20, resources = 1, navEnd = plan.navEnd === undefined ? 30 : plan.navEnd, reloads = 0;
const body = { kids: [], appendChild(e){ e.parentNode = body; this.kids.push(e); return e; }, removeChild(e){ this.kids = this.kids.filter(k => k !== e); e.parentNode = null; return e; } };
const htmlEl = { classList: { add(){}, remove(){} } };
const els = {};
const document = { documentElement: htmlEl, body: body, getElementById(id){ return els[id] || null; }, getElementsByTagName(){ return { length: nodes }; }, addEventListener(){}, createElement(tag){ return { tagName: tag.toUpperCase(), id: '', innerHTML: '', parentNode: null }; } };
function screen(hidden){ return { classList: { contains(c){ return c === 'hidden' && hidden; } } }; }
els.sTitle = screen(false); els.sGame = screen(true); els.sResult = screen(true); els.swBigDate = { textContent: '' };
const wl = {};
const window = { addEventListener(t, fn){ (wl[t] = wl[t] || []).push(fn); } };
const performance = { getEntriesByType(t){ return t === 'navigation' ? [{ responseEnd: now >= navEnd ? navEnd : 0 }] : { length: resources }; } };
const location = { reload(){ reloads++; } };
const Date_ = { now: () => now };
function setInterval(fn, ms){ const id = ++tid; timers.push({ id, fn, ms, at: now + ms }); return id; }
function clearInterval(id){ timers = timers.filter(t => t.id !== id); }
const src = html.slice(a + 8, b).replace(/Date\.now\(\)/g, 'Date_.now()');
eval(src);
// 見はりの 無い 版(周回167 まで)でも 同じ 場面を 流し、知らせが 出ない ことで 落ちる ように する(名前が 無い ことで 落とさない)
const shown = () => body.kids.some(k => k.id === 'bootSlow');
const log = [];
const ev = (plan.events || []).slice().sort((x, y) => x[0] - y[0]);
for (let t = 0; t <= plan.until; t += 50) {
  now = t;
  while (ev.length && ev[0][0] <= t) {
    const e = ev.shift();
    if (e[1] === 'grow') nodes += 5;
    else if (e[1] === 'file') resources++;
    else if (e[1] === 'ready') { window.Kome365 = {}; window.KomeCards = {}; els.sTitle = screen(true); els.sGame = screen(false); els.swBigDate.textContent = '1月1日'; if (window.__komeBoot) window.__komeBoot.ready(); }   // 本当に 始まった(1枚目の カード)
    else if (e[1] === 'readyResult') { window.Kome365 = {}; window.KomeCards = {}; els.sTitle = screen(true); els.sResult = screen(false); if (window.__komeBoot) window.__komeBoot.ready(); }   // 1年が 終わった 記録
    else if (e[1] === 'scripts') { window.Kome365 = {}; window.KomeCards = {}; }   // engine.js・cards.js が 届いて 動いた(まだ 始まって いない)
    else if (e[1] === 'tail') { if (e[2]) window.KomeCards = {}; if (window.__komeBoot) window.__komeBoot.ready(); }   // さいごの 行は 通ったが ゲームは 始まって いない(engine.js が 無い)
    else if (e[1] === 'scriptError') (wl.error || []).forEach(fn => fn({ target: { tagName: 'SCRIPT', src: 'https://go.ricepia.jp/kome365/' + e[2] } }));
    else if (e[1] === 'imgError') (wl.error || []).forEach(fn => fn({ target: { tagName: 'IMG', src: 'x.webp' } }));
    else if (e[1] === 'runError') (wl.error || []).forEach(fn => fn({ target: window, message: 'x' }));
    else if (e[1] === 'tap') { const k = body.kids.find(k => k.id === 'bootSlow'); if (k) k.onclick(); }
  }
  for (const tm of timers.slice()) while (timers.indexOf(tm) >= 0 && tm.at <= now) { tm.at += tm.ms; tm.fn(); }
  log.push([t, shown()]);
}
const firstOn = (log.find(x => x[1]) || [null])[0];
const box = body.kids.find(k => k.id === 'bootSlow');
console.log(JSON.stringify({ firstOn: firstOn, endOn: shown(), reloads: reloads, text: box ? box.innerHTML : '' }));
"""


def boot_run(plan):
    node = shutil.which("node")
    if not node:
        raise unittest.SkipTest("node がないので実行の確認は飛ばす")
    out = subprocess.run([node, "-e", BOOT_JS, HTML_PATH, json.dumps(plan)], capture_output=True, text=True)
    if out.returncode != 0:
        raise AssertionError(out.stderr[-2000:])
    return json.loads(out.stdout.strip().splitlines()[-1])



# 周回171(運営者の声 2026-11-12「田んぼの状況の花や木やキャラクターの顔は削除し、…ドット絵を追加。」): 田んぼの 絵(#swPaddy)の コードを index.html から 取り出し、
# にせの 画面と にせの 田んぼ(f)で 本当に 動かす。手ごとに 何の 絵か・走る 機械・ぬれ・ふくらみ を 返す
PADDY_JS = r"""
const fs = require('fs');
const html = fs.readFileSync(process.argv[1], 'utf8');
const a = html.indexOf('  var PDPAL = {'), b = html.indexOf('  /* 小さな再会(周回125', a);
if (a < 0 || b < 0) { console.log(JSON.stringify({ error: 'no paddy code' })); process.exit(0); }
function mk(){ const el = { style: {}, attrs: {}, _cl: new Set(), offsetWidth: 1, setAttribute(k, v){ this.attrs[k] = String(v); }, removeAttribute(k){ delete this.attrs[k]; }, hasAttribute(k){ return k in this.attrs; }, getAttribute(k){ return k in this.attrs ? this.attrs[k] : null; },
  classList: { add(x){ el._cl.add(x); }, remove(x){ el._cl.delete(x); }, contains(x){ return el._cl.has(x); }, toggle(x, v){ if (v) el._cl.add(x); else el._cl.delete(x); } } }; return el; }
const parts = { '.pdBase': mk(), '.pdWin': mk(), '.pdTrail': mk(), '.pdVeh': mk(), '.pdPop': mk(), '.pdRain': mk() };
const root = mk(); root.querySelector = sel => parts[sel] || null;
const $ = id => id === 'swPaddy' ? root : null;
let f = { method: 'transplant', doy: 1, tillDepth: null }, choices = '', skyWxInfo = { key: 'fair' };
const traceInfo = { okN: 0 };
eval(html.slice(a, b));
// 周回172: 絵に 奥の 水路・水口(水の 色)が ある ので、水・ひびは 田の 中(y 5〜13)の ドット だけで 見る
function pixMap(img){ const sv = decodeURIComponent(String(img || '')), g = {}; let m; const re = /<rect x="(\d+)" y="(\d+)" width="(\d+)" height="1" fill="(#[0-9a-f]+)"/gi; while ((m = re.exec(sv))) { for (let i = 0; i < +m[3]; i++) g[(+m[1] + i) + ',' + m[2]] = m[4].toLowerCase(); } return g; }
function fieldHas(img, cols){ const sv = decodeURIComponent(String(img || '')); let m; const re = /<rect x="(\d+)" y="(\d+)" width="(\d+)" height="1" fill="(#[0-9a-f]+)"/gi; while ((m = re.exec(sv))) { const y = +m[2]; if (y >= 5 && y <= 13 && cols.indexOf(m[4].toLowerCase()) >= 0) return true; } return false; }
(async () => {
  const out = [];
  for (const st of JSON.parse(process.argv[2])) {
    if (st.f) Object.assign(f, st.f);
    if (st.ok != null) traceInfo.okN = st.ok;
    if (st.len != null) choices = 'L'.repeat(st.len);
    if (st.wx) skyWxInfo = { key: st.wx };
    if (st.pev) { const ev = st.pev; f.patrolEvents = () => ev; }
    if (st.tick) await new Promise(r => setTimeout(r, 0));
    paddyDraw();
    out.push({ base: paddyInfo.base, nursery: paddyInfo.nursery, wet: root.hasAttribute('data-wet'), veh: root.getAttribute('data-veh') || '', key: paddyInfo.key, lv: paddyInfo.lv, marks: paddyInfo.marks,
      pop: parts['.pdPop']._cl.has('on'), popKey: paddyInfo.pop, img: parts['.pdBase'].style.backgroundImage || '', trailImg: parts['.pdTrail'].style.backgroundImage || '', cond: paddyInfo.cond || '', pix: pixMap(parts['.pdBase'].style.backgroundImage), water: fieldHas(parts['.pdBase'].style.backgroundImage, ['#57b6f2', '#2f7fd0']), crack: fieldHas(parts['.pdBase'].style.backgroundImage, ['#3a2413']), bg: (parts['.pdBase'].style.backgroundImage || '').indexOf('data:image/svg+xml') >= 0, trail: (parts['.pdTrail'].style.backgroundImage || '').indexOf('data:image/svg+xml') >= 0 });
  }
  console.log(JSON.stringify(out));
})();
"""


def paddy_run(steps):
    node = shutil.which("node")
    if not node:
        raise unittest.SkipTest("node がないので実行の確認は飛ばす")
    out = subprocess.run([node, "-e", PADDY_JS, HTML_PATH, json.dumps(steps)], capture_output=True, text=True)
    if out.returncode != 0:
        raise AssertionError(out.stderr[-2000:])
    r = json.loads(out.stdout.strip().splitlines()[-1])
    if isinstance(r, dict) and r.get("error"):
        raise AssertionError(r["error"])
    return r


# 周回171: 本物の ブラウザ(Playwright の Chromium)で、保存から 開いた 田んぼの 絵が 6つの 画面で ほかの 部品に 重ならない・はみ出さないかを はかる。
# 保存は ふつうに 1年 遊んだ ときの もの(1月の 雨の 日・苗箱・田植えの あと・出穂・実り・刈り株)。サーバーは 立てず ディスクから 返す
PADDY_SAVES = {'rain': '{"v":"kokoro","y":"recent","so":"high","m":"transplant","c":0,"s":1543068361,"fm":"oneshot","yh":0,"ch":"LL"}', 'nursery': '{"v":"kokoro","y":"recent","so":"high","m":"transplant","c":0,"s":1543068361,"fm":"oneshot","yh":0,"ch":"LLLLRLLLLLRLRLRLRRRLLLLLRLLRRLRLLLRLRLRLLRLLLLRLLLRLRLRLLLRLLLLLLLRLLLLRRLRLLLRLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLR"}', 'nae': '{"v":"kokoro","y":"recent","so":"high","m":"transplant","c":0,"s":1543068361,"fm":"oneshot","yh":0,"ch":"LLLLRLLLLLRLRLRLRRRLLLLLRLLRRLRLLLRLRLRLLRLLLLRLLLRLRLRLLLRLLLLLLLRLLLLRRLRLLLRLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLRLRLLLRLRLRRLLLLLLLRRLRRRL"}', 'head': '{"v":"kokoro","y":"recent","so":"high","m":"transplant","c":0,"s":1543068361,"fm":"oneshot","yh":0,"ch":"LLLLRLLLLLRLRLRLRRRLLLLLRLLRRLRLLLRLRLRLLRLLLLRLLLRLRLRLLLRLLLLLLLRLLLLRRLRLLLRLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLRLRLLLRLRLRRLLLLLLLRRLRRRLLLLLLLRLLLLLRLRLLLLLLLLRRLLRLLLLLLLLLLLLRLLLLRRLRLRLLLLLLLLLLLLLRRLLLLLLLLRLL"}', 'ripe': '{"v":"kokoro","y":"recent","so":"high","m":"transplant","c":0,"s":1543068361,"fm":"oneshot","yh":0,"ch":"LLLLRLLLLLRLRLRLRRRLLLLLRLLRRLRLLLRLRLRLLRLLLLRLLLRLRLRLLLRLLLLLLLRLLLLRRLRLLLRLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLRLRLLLRLRLRRLLLLLLLRRLRRRLLLLLLLRLLLLLRLRLLLLLLLLRRLLRLLLLLLLLLLLLRLLLLRRLRLRLLLLLLLLLLLLLRRLLLLLLLLRLLLRLLLRLLLLLRLRLLLRLRLLLLLLLLLLLRLR"}', 'stubble': '{"v":"kokoro","y":"recent","so":"high","m":"transplant","c":0,"s":1543068361,"fm":"oneshot","yh":0,"ch":"LLLLRLLLLLRLRLRLRRRLLLLLRLLRRLRLLLRLRLRLLRLLLLRLLLRLRLRLLLRLLLLLLLRLLLLRRLRLLLRLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLRLRLLLRLRLRRLLLLLLLRRLRRRLLLLLLLRLLLLLRLRLLLLLLLLRRLLRLLLLLLLLLLLLRLLLLRRLRLRLLLLLLLLLLLLLRRLLLLLLLLRLLLRLLLRLLLLLRLRLLLRLRLLLLLLLLLLLRLRLRL"}'}
PADDY_BROWSER_JS = r"""
const fs = require('fs'), path = require('path');
let chromium; try { ({ chromium } = require('playwright')); } catch (e) { console.log(JSON.stringify({ skip: 'playwright なし' })); process.exit(0); }
const [htmlPath, root, vpsJ, savesJ] = process.argv.slice(1, 5);
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.css': 'text/css', '.ico': 'image/x-icon' };
const IDS = ['swCard', 'swHand', 'swKakashi', 'swSkyWx', 'swAheadWx', 'swDayGuest', 'swReunion', 'swHome', 'swTrace', 'swGrow', 'swFriends', 'swCount', 'swSun'];   // 周回172: 見る 部品は 下で 機械的に 集める(位置を 持つ 要素 ぜんぶ)。この 一覧は「集めた 中に 入って いる はず」の 確かめ だけ
(async () => {
  let b; try { b = await chromium.launch(); } catch (e) { console.log(JSON.stringify({ skip: 'chromium が 起動しない' })); return; }
  const saves = JSON.parse(savesJ), out = [];
  for (const [w, h] of JSON.parse(vpsJ)) for (const [name, sv] of Object.entries(saves)) for (const rm of name === 'rain' ? [false, true] : [false]) {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true, reducedMotion: rm ? 'reduce' : 'no-preference' });
    const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
    await ctx.addInitScript(s => { try { localStorage.setItem('kome365_swipe_save', s); } catch (e) {} }, sv);
    await p.route('http://kome.test/**', r => { const u = new URL(r.request().url()); let f = u.pathname === '/kome365/index.html' ? htmlPath : path.join(root, decodeURIComponent(u.pathname));
      if ((!f.startsWith(root) && f !== htmlPath) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) return r.fulfill({ status: 404, body: '' });
      r.fulfill({ status: 200, contentType: TYPES[path.extname(f)] || 'application/octet-stream', body: fs.readFileSync(f) }); });
    await p.goto('http://kome.test/kome365/index.html?no3d');
    await p.waitForFunction(() => window.__komeReady, null, { timeout: 60000 }).catch(() => {});
    await p.waitForTimeout(1500);
    const r = await p.evaluate((IDS) => {
      const R = e => { const r = e.getBoundingClientRect(); return [r.left, r.top, r.right, r.bottom]; };
      const vis = e => { if (!e) return false; for (let n = e; n && n.nodeType === 1; n = n.parentElement) { const cs = getComputedStyle(n); if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity < 0.3) return false; } return e.getClientRects().length > 0; };
      const e = document.getElementById('swPaddy'); if (!window.__swipe || !vis(e)) return { hidden: true };
      const A = R(e), o = {}, seen = [], skip = new Set(['sGame', 'swipe', 'swStage', 'swWrap', 'swPaddy', 'swPvScene', 'swSkyTint', 'swStageTint', 'swHealthTint', 'swSunLight']);   // 色みの 層(景色 ぜんぶに かける 色)は 部品 では ない
      for (const x of document.querySelectorAll('#sGame [id]')) { if (skip.has(x.id) || e.contains(x) || x.contains(e)) continue; const cs = getComputedStyle(x); if (cs.position === 'static' && !(x.parentElement && x.parentElement.id === 'swWrap')) continue; if (!vis(x)) continue; const B = R(x); if ((B[2] - B[0]) * (B[3] - B[1]) >= 0.6 * innerWidth * innerHeight) continue; seen.push(x.id);
        const ix = Math.min(A[2], B[2]) - Math.max(A[0], B[0]), iy = Math.min(A[3], B[3]) - Math.max(A[1], B[1]); if (ix > 0.5 && iy > 0.5) o[x.id] = Math.round(ix * iy); }
      const st = window.__swipe.paddyState(), rn = e.querySelector('.pdRain');
      return { seen: seen.filter(id => IDS.includes(id)), box: A.map(Math.round), inView: A[0] >= 0 && A[1] >= 0 && A[2] <= innerWidth && A[3] <= innerHeight && A[2] - A[0] > 0, hscroll: document.documentElement.scrollWidth > innerWidth, over: o, base: st.base, wet: st.wet,
        rainAnim: getComputedStyle(rn).animationName, removed: ['swMood', 'swGreet', 'swRich', 'swDelay', 'swSeasonScene'].filter(id => document.getElementById(id)) };
    }, IDS);
    out.push(Object.assign({ w, h, name, rm, errs: errs.length }, r));
    await ctx.close();
  }
  await b.close(); console.log(JSON.stringify(out));
})();
"""


# サイクル173(運営者の声 2026-11-12「米作り３６５にほのぼのした音を入れる」): にせの AudioContext で、いつ 音が 作られたかを 数える。
# 場面ごとに 新しい 画面を 開き、本物に 近い 指(CDP の タッチ)で カードを はじく。サーバーは 立てず ディスクから 返す
SOUND_BROWSER_JS = r"""
const fs = require('fs'), path = require('path');
let chromium; try { ({ chromium } = require('playwright')); } catch (e) { console.log(JSON.stringify({ skip: 'playwright なし' })); process.exit(0); }
const [htmlPath, root, plansJ] = process.argv.slice(1, 4);
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.css': 'text/css' };
const FAKE = (mode) => {
  window.__fa = { made: 0, osc: 0, src: 0, resume: 0, suspend: 0, allow: mode !== 'lateAllow', srcs: [] };
  // 周回173 の 直し(レビュー P2): 音の つながりを 覚え、まだ 鳴って いない 音が スピーカーまで つながって いる 数を 数える
  window.__fa.live = (bornBefore, bornAfter) => { const now = performance.now() / 1000; const reach = (n, d) => !!n && (n._dest || (d < 12 && (n._out || []).some(x => reach(x, d + 1)))); return window.__fa.srcs.filter(x => x.born <= bornBefore && x.born >= (bornAfter || 0) && x.t > now + 0.05 && reach(x.n, 0)).length; };
  if (mode === 'none') { try { delete window.AudioContext; delete window.webkitAudioContext; } catch (e) {} window.AudioContext = undefined; window.webkitAudioContext = undefined; return; }
  const P = () => ({ value: 0, setValueAtTime(){}, linearRampToValueAtTime(){}, exponentialRampToValueAtTime(){}, setTargetAtTime(){} });
  const N = (src) => { const n = { _out: [], connect(x){ if (x && typeof x === 'object' && !('value' in x)) n._out.push(x); return x; }, disconnect(){ n._out = []; }, start(t){ if (src) window.__fa.srcs.push({ n: n, born: performance.now(), t: typeof t === 'number' && t > 0 ? t : performance.now() / 1000 }); }, stop(){}, gain: P(), frequency: P(), detune: P(), Q: P(), type: '', buffer: null, loop: false }; return n; };
  function AC(){ if (mode === 'throw') throw new Error('no audio'); window.__fa.made++; this.state = 'suspended'; this.sampleRate = 22050; this.destination = N(); this.destination._dest = true; window.__fa.ac = this; }
  Object.defineProperty(AC.prototype, 'currentTime', { get(){ return performance.now() / 1000; } });
  AC.prototype.resume = function(){ window.__fa.resume++; const me = this; if (mode === 'slow') return new Promise(r => setTimeout(() => { me.state = 'running'; r(); }, 60));   // 解けるまで 0.06秒 かかる
    if (window.__fa.allow) this.state = 'running'; return Promise.resolve(); };
  AC.prototype.suspend = function(){ window.__fa.suspend++; this.state = 'suspended'; return Promise.resolve(); };
  AC.prototype.createOscillator = function(){ window.__fa.osc++; return N(true); };
  AC.prototype.createBufferSource = function(){ window.__fa.src++; return N(true); };
  AC.prototype.createGain = AC.prototype.createBiquadFilter = function(){ return N(); };
  AC.prototype.createBuffer = function(ch, len){ return { getChannelData(){ return new Float32Array(len); } }; };
  window.AudioContext = AC; window.webkitAudioContext = AC;
};
(async () => {
  let b; try { b = await chromium.launch(); } catch (e) { console.log(JSON.stringify({ skip: 'chromium が 起動しない' })); return; }
  const out = {};
  for (const pl of JSON.parse(plansJ)) {
    const ctx = await b.newContext({ viewport: { width: pl.w || 390, height: pl.h || 844 }, isMobile: true, hasTouch: true, reducedMotion: pl.reduce ? 'reduce' : 'no-preference' });
    const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
    await ctx.addInitScript(FAKE, pl.mode || 'ok');
    if (pl.store === 'throw') await ctx.addInitScript(() => { const g = Storage.prototype.getItem, s = Storage.prototype.setItem; Storage.prototype.getItem = function(){ throw new Error('blocked'); }; Storage.prototype.setItem = function(){ throw new Error('blocked'); }; });
    if (pl.save) await ctx.addInitScript(s => { try { if (!sessionStorage.getItem('sv')) { sessionStorage.setItem('sv', '1'); localStorage.setItem('kome365_swipe_save', s); } } catch (e) {} }, pl.save);
    if (pl.store === 'junk') await ctx.addInitScript(() => { try { localStorage.setItem('kome365_sound', '{{oops'); localStorage.setItem('kome365_swipe_save', '{"v":'); } catch (e) {} });
    await p.route('http://kome.test/**', r => { const u = new URL(r.request().url()); let f = u.pathname === '/kome365/index.html' ? htmlPath : path.join(root, decodeURIComponent(u.pathname));
      if ((!f.startsWith(root) && f !== htmlPath) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) return r.fulfill({ status: 404, body: '' });
      r.fulfill({ status: 200, contentType: TYPES[path.extname(f)] || 'application/octet-stream', body: fs.readFileSync(f) }); });
    const cdp = await ctx.newCDPSession(p);
    const swipe = async (dir) => { const bx = await p.locator('#swCard').boundingBox(); const x = bx.x + bx.width / 2, y = bx.y + bx.height / 2;
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
      for (let i = 1; i <= 6; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + dir * 30 * i, y }] }); await p.waitForTimeout(16); }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await p.waitForTimeout(1300); };
    const st = () => p.evaluate(() => ({ fa: (({ srcs, live, ac, ...o }) => o)(window.__fa || {}), ctxState: window.__fa && window.__fa.ac ? window.__fa.ac.state : '', screen: ['sTitle', 'sGame', 'sResult'].filter(id => !document.getElementById(id).classList.contains('hidden')).join(),
      tgl: (() => { const e = [...document.querySelectorAll('#swSnd, [data-snd]')].find(x => x.getClientRects().length && getComputedStyle(x).visibility !== 'hidden'); if (!e) return null; const b = e.getBoundingClientRect(); return { id: e.id, text: e.textContent, box: [b.left, b.top, b.right, b.bottom], inView: b.left >= 0 && b.top >= 0 && b.right <= innerWidth && b.bottom <= innerHeight };   })(), ks: window.__ks ? window.__ks.state() : { on: null, dead: false, ctx: '', bgm: false, fx: {}, log: [] }, date: (document.getElementById('swBigDate') || {}).textContent || '', btn: (document.getElementById('swSnd') || {}).textContent || '', store: (() => { try { return localStorage.getItem('kome365_sound'); } catch (e) { return 'x'; } })() }));
    const r = { steps: [] };
    if (pl.loadTap) { await p.goto('http://kome.test/kome365/index.html?no3d', { waitUntil: 'domcontentloaded' }); await p.touchscreen.tap(200, 160); r.steps.push(['loadTap', await st()]); }
    else await p.goto('http://kome.test/kome365/index.html?no3d');
    await p.waitForFunction(() => window.__komeReady, null, { timeout: 60000 }).catch(() => {});
    await p.waitForTimeout(800);
    r.steps.push(['ready', await st()]);
    for (const a of pl.acts || []) {
      if (a === 'allow') await p.evaluate(() => { window.__fa.allow = true; });
      else if (a === 'L' || a === 'R') await swipe(a === 'L' ? -1 : 1);
      else if (a === 'mute') { if (await p.locator('#swSnd').count()) await p.tap('#swSnd', { timeout: 5000 }); await p.waitForTimeout(300); }   // ボタンが 無い 版では 押せない(下の 確かめで 落ちる)
      else if (a === 'wait') await p.waitForTimeout(2500);
      else if (a === 'keyL') { await p.keyboard.press('ArrowLeft'); r.js = r.js || []; r.js.push(await p.evaluate(() => window.__fa.live(window.__tc, window.__ts))); }   // 決めた すぐ あとに 古い 予約が のこって いるか
      else if (a === 'home') { await p.tap('#swHome'); r.js = r.js || []; r.js.push(await p.evaluate(() => window.__fa.live(window.__tc || 1e12, window.__ts || 0))); await p.waitForTimeout(150); }
      else if (a === 'tapTgl') { const h = await p.evaluateHandle(() => [...document.querySelectorAll('#swSnd, [data-snd]')].find(x => x.getClientRects().length)); const e = h.asElement(); if (e) await e.tap(); await p.waitForTimeout(300); }
      else if (a.startsWith('js:')) { r.js = r.js || []; r.js.push(await p.evaluate(a.slice(3))); }
      else if (a === 'olap') { r.olap = r.olap || []; r.olap.push(await p.evaluate(() => {   // 見えて いる 画面の 字・ボタン・絵と 音の ボタンの 重なり
        const t = [...document.querySelectorAll('#swSnd, [data-snd]')].find(x => x.getClientRects().length); if (!t) return { none: true }; const A = t.getBoundingClientRect(), o = {};
        const sec = ['sTitle', 'sResult'].map(id => document.getElementById(id)).find(x => !x.classList.contains('hidden'));
        for (const x of sec.querySelectorAll('*')) { if (x === t || x.contains(t) || t.contains(x) || !x.getClientRects().length) continue; const cs = getComputedStyle(x); if (cs.visibility === 'hidden' || +cs.opacity < 0.3) continue;
          const leaf = !x.children.length || /^(BUTTON|A|SUMMARY|H1|H2|P|IMG|CANVAS|SPAN|B|SMALL)$/.test(x.tagName); if (!leaf) continue; const B = x.getBoundingClientRect(); const ix = Math.min(A.right, B.right) - Math.max(A.left, B.left), iy = Math.min(A.bottom, B.bottom) - Math.max(A.top, B.top); if (ix > 0.5 && iy > 0.5) o[x.tagName + '#' + (x.id || x.className || '').toString().slice(0, 20)] = Math.round(ix * iy); }
        const hit = document.elementFromPoint((A.left + A.right) / 2, (A.top + A.bottom) / 2); return { o: o, box: [A.left, A.top, A.width, A.height], top: !!hit && (hit === t || t.contains(hit)), hscroll: document.documentElement.scrollWidth > innerWidth }; })); }
      else if (a === 'hide' || a === 'show') { await p.evaluate((h) => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => h }); Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => h ? 'hidden' : 'visible' }); document.dispatchEvent(new Event('visibilitychange')); }, a === 'hide'); await p.waitForTimeout(300); }
      else if (a === 'reload') { await p.reload(); await p.waitForFunction(() => window.__komeReady, null, { timeout: 60000 }).catch(() => {}); await p.waitForTimeout(800); }
      r.steps.push([a, await st()]);
    }
    if (pl.box) r.box = await p.evaluate(() => { const e = document.getElementById('swSnd'); const b = e && e.getBoundingClientRect(); return b ? [b.left, b.top, b.width, b.height] : null; });
    r.errs = errs; out[pl.name] = r; await ctx.close();
  }
  await b.close(); console.log(JSON.stringify(out));
})();
"""


def sound_run(plans):
    node = shutil.which("node")
    if not node:
        raise unittest.SkipTest("node がないので実行の確認は飛ばす")
    out = subprocess.run([node, "-e", SOUND_BROWSER_JS, HTML_PATH, ROOT, json.dumps(plans)], capture_output=True, text=True, timeout=900)
    if out.returncode != 0:
        raise AssertionError(out.stderr[-2000:])
    r = json.loads(out.stdout.strip().splitlines()[-1])
    if isinstance(r, dict) and r.get("skip"):
        raise unittest.SkipTest(r["skip"])
    return r


# 周回172: 6つの 画面 × 保存 の 場面で、太陽(運営者が のこす と 決めた)が 田んぼの 絵に かかって よい 場面の 数の 上の かぎり(いまの 数。ふえたら 落ちる)
SUN_HITS_MAX = 0


def css_rule(selector):
    m = re.search(r"^" + re.escape(selector) + r"\{([^}]*)\}", HTML, re.M)
    return m.group(1) if m else ""


class TestKome365FirstMinute(unittest.TestCase):
    def test_paddy_lives_inside_card_wrap(self):
        # 周回171(運営者の声で 仕様が 変わった): 蓄積の植物(#swRich)と金の花(#swDelay)は 消し、その 場所(#swWrap の 中・「世話のあと」の 次)に 田んぼの 絵(#swPaddy)
        wrap = HTML[HTML.index('<div id="swWrap">'):HTML.index('<div id="swCard"')]
        self.assertIn('<div id="swTrace" aria-hidden="true"></div><div id="swPaddy" aria-hidden="true"><span class="pdBase"></span><span class="pdWin"><span class="pdTrail"></span></span><span class="pdVeh"></span><span class="pdPop"></span><span class="pdRain"></span></div>', wrap)
        self.assertEqual(HTML.count('id="swPaddy"'), 1)
        # 消した もの(花・芽の 列・金の 花・木・顔・挨拶の 顔)
        for gone in ("swRich", "swDelay", "swSeasonScene", "swMood", "swGreet"):
            self.assertNotIn('id="%s"' % gone, HTML, gone)
            self.assertNotIn("#%s{" % gone, HTML, gone)
        for fn in ("function richDraw(", "function richNext(", "function delayDraw(", "function branchAdd(", "function greetSet(", "function greetClear(", "function pvMoodSet(", "function fingerStroke("):
            self.assertNotIn(fn, HTML, fn)
        # 残す もの(かかし・太陽・育ちの 点の 列・その日の 生きもの・土の タイルの 列・カードの 後ろの 稲の 列)
        for kept in ("swKakashi", "swSun", "swGrow", "swDayGuest", "swReunion", "swTrace", "swStagePlants"):
            self.assertEqual(HTML.count('id="%s"' % kept), 1, kept)
        # 周回172(運営者の声「左上や右上の丸いアイコンはなんなんのか分からない。削除」): 天気の 丸・あしたの 空の 丸・育ちの 丸の 絵を 消した
        for gone in ("swSkyWx", "swAheadWx"):
            self.assertNotIn(gone, HTML, gone)
        self.assertNotIn("grIc", HTML)

    def test_paddy_is_anchored_above_card(self):
        # 画面の高さの割合ではなく、カードの上端から数える(土の タイルの 列の すぐ 上)
        pd = css_rule("#swPaddy")
        self.assertIn("bottom:calc(100% + var(--pdb))", pd)
        self.assertNotRegex(pd, r"(^|;)top:")
        self.assertIn("width:calc(var(--pd) * 44);height:calc(var(--pd) * 18)", pd)   # 周回172: ななめ上から 見た 田んぼ(44×18)
        self.assertIn("#swWrap{--pd:6px;--pdb:48px;--pdx:-3px}", HTML)   # 周回172: 丸が 消えて あいた ぶん 6px(かかしは 5.25px)

    def test_day_guest_stays_out_of_weather_column(self):
        # 訪問者は 今日の空・あしたの空の丸の列(右から84px)より左に置く
        self.assertIn("e.style.right = 'calc(84px + ' + v.slot + ' * max(0px, 50% - 144px) / 2)';", HTML)
        self.assertNotIn("e.style.right = (16 + v.slot * 44) + 'px';", HTML)
        self.assertIn("@media (max-height:740px){#swDayGuest{top:calc(36% - 26px)}}", HTML)

    def test_tap_does_not_kill_first_card_guide(self):
        # 周回153: 触れただけでは ◀ ▶ の案内を「見た」ことにしない。決めずに離したら出し直す
        down = HTML[HTML.index("el.card.addEventListener('pointerdown'"):HTML.index("el.card.addEventListener('pointermove'")]
        self.assertIn("ghostPause();", down)
        self.assertNotIn("ghostOff()", down)
        pause = HTML[HTML.index("function ghostPause(){"):HTML.index("function ghostBack(){")]
        self.assertNotIn("store.set", pause)
        self.assertRegex(HTML, r"function ghostBack\(\)\{ (demoMiss\+\+; demoArm\(\); )?var on = !ghostDone && choices\.length === 0 && !calmOn\(\);")
        self.assertRegex(HTML, r"choose\('right', v\); \} else \{ (if \(tapMax < 12\) tapOnly\+\+; (else tapOnly = 0; )?)?reset\(\); ghostBack\(\); \}")
        # 決めたとき(choose)は これまでどおり二度と出さない
        choose = HTML[HTML.index("function choose(side, vel){"):HTML.index("function choose(side, vel){") + 200]
        self.assertIn("ghostOff();", choose)

    def test_trace_row_fits_between_side_columns_on_low_screens(self):
        # 周回153: 790px以下では世話のあとを30pxにし、季節の景色・あしたの空の丸にかからない幅にする
        self.assertIn("@media (max-height:790px){#swTrace .tr{width:30px;height:30px;background-size:30px 30px}#swWrap{--pdb:38px}}", HTML)   # 周回171: 花の 列・金の 花の かわりに 田んぼの 絵(周回172: 高さは 変数で)
        self.assertNotIn("#swSeasonScene", HTML)   # 周回171: 季節の 景色(木)は 運営者の 声で 消した

    def test_guide_waits_for_entering_card(self):
        # 周回154: カードが入ってくる間は、後ろの案内の影と矢印を先に見せない(暗い箱のちらつき)
        self.assertRegex(HTML, r"#swWrap:has\(#swCard\.enter\) #swGhost\.on\{animation:sw(GhostSlide 4\.4s|DemoGhost 5s) ease-in-out infinite,swGhostIn \.24s linear both\}")
        self.assertIn("#swWrap:has(#swCard.enter) #swGhostArrows.on{animation:swGhostArrowsSlide 4.4s ease-in-out infinite,swGhostIn .24s linear both}", HTML)
        self.assertIn("@keyframes swGhostIn{0%,60%{opacity:0}100%{opacity:1}}", HTML)
        # 押して離したあとの出し直しでは消さない: つかんだ時点で enter を外している
        down = HTML[HTML.index("el.card.addEventListener('pointerdown'"):HTML.index("el.card.addEventListener('pointermove'")]
        self.assertIn("el.card.classList.remove('enter', 'wig')", down)

    def test_2d_field_uses_todays_weather(self):
        # 周回154: 2Dの絵も3Dと同じ fview(今日の天気)で空と雨を描く
        draw = HTML[HTML.index("function drawField(){"):HTML.index("// 遠くの山と家")]
        self.assertIn("const fv = fview(f), lastRain = fv.daily.length && fv.daily[fv.daily.length - 1].rain;", draw)
        self.assertNotIn("lastRain = f.daily.length && f.daily[f.daily.length - 1].rain", draw)
        self.assertIn("window.Field3D.update(fview(f))", draw)

    def test_swipe_demo_finger(self):
        # 周回155(店主指示 2026-11-10「スワイプの仕方の手本を出す」): 指が押さえて横へ引く手本
        self.assertIn('<div id="swHand" aria-hidden="true"><i class="hdTrail hdTrailR"></i><i class="hdTrail hdTrailL"></i><i class="hdRing"></i><div class="hdMove"><i class="hdFinger"></i></div></div><div id="swGuide"', HTML)
        self.assertIn("#swHand{position:absolute;inset:0;z-index:6;display:none;pointer-events:none}", HTML)
        self.assertIn("#swWrap.demoOn #swHand{display:block}", HTML)
        # 指・うしろの影・札の光は同じ5秒の拍子。引く幅は確定距離以上(±23%)
        self.assertIn("@keyframes swDemoMove{0%,10%{transform:translateX(0)}26%,42%{transform:translateX(23%)}42.01%,60%{transform:translateX(0)}76%,92%{transform:translateX(-23%)}92.01%,100%{transform:translateX(0)}}", HTML)
        self.assertIn("@keyframes swDemoGhost{0%,10%{transform:translateX(0) rotate(0)}26%,36%{transform:translateX(23%) rotate(1.5deg)}", HTML)
        self.assertIn("#swWrap.demoOn #swEdge .eR{animation:swDemoGlowR 5s ease-in-out infinite}", HTML)
        # 手本が出ている間は ◀ ▶ を重ねない。動きを減らす設定では止まった指 + 丸い ◀ ▶
        self.assertIn("#swWrap.demoOn #swGhostArrows,#swWrap.demoOn #swGhostArrows.on{display:none}", HTML)
        self.assertIn("@media (prefers-reduced-motion: no-preference){#swWrap.demoOn #swGuide{display:none!important}}", HTML)
        self.assertIn("#swHand .hdMove,#swHand .hdFinger{animation:none}#swHand .hdFinger{opacity:1}#swHand .hdRing,#swHand .hdTrail{display:none}", HTML)

    def test_swipe_demo_lifecycle(self):
        # 出す: まだ決めていない最初の1枚、または最初の3枚で2回つづけて押しただけの人
        # 周回157(店主の声 2026-11-10「スワイプお手本が出ない」): 進んだ端末でも 更新のあと 最初の1回は出す・何枚目でも 押しただけ2回で出す
        self.assertIn("var DEMO = 'kome365_demo_seen', demoDone = store.get(DEMO) === '1';", HTML)
        self.assertIn("function demoWant(){ return !demoDone || tapOnly >= 2; }", HTML)
        self.assertIn("function ghostOff(){ tapOnly = 0; if (!demoDone) { demoDone = true; store.set(DEMO, '1'); } demoSet(false);", HTML)
        # 触れている間は止め、決めずに離したら出し直し、スワイプで決めたら片づける
        self.assertIn("function ghostPause(){ demoSet(false);", HTML)
        self.assertIn("$('swGhostArrows').classList.toggle('on', on); demoSet(demoWant()); }", HTML)
        self.assertIn("function ghostOff(){ tapOnly = 0; if (!demoDone) { demoDone = true; store.set(DEMO, '1'); } demoSet(false);", HTML)
        self.assertIn("} else { if (tapMax < 12) tapOnly++; else tapOnly = 0; reset(); ghostBack(); }", HTML)
        # 指を置く高さは大きな絵の段(日付・題・札にかけない)
        self.assertIn("hd.style.setProperty('--hy', (ic.offsetTop + 4) + 'px')", HTML)
        # カードそのものは手本では動かさない: 手本の動きは #swHand・#swGhost・札の光だけ
        self.assertNotRegex(HTML, r"#swWrap\.demoOn #swCard[^{]*\{[^}]*(transform|animation)")

    def test_swipe_demo_review_fixes(self):
        # Codex指摘(PR #1071): 押しただけが「つづいて」2回のときだけ手本を出す(間に引いたら数えなおす)
        self.assertIn("if (tapMax < 12) tapOnly++; else tapOnly = 0; reset(); ghostBack();", HTML)
        # 手本が出ている間に画面の大きさが変わったら、指の高さを測り直す
        self.assertIn("window.addEventListener('resize', function(){ if ($('swWrap').classList.contains('demoOn')) demoSet(true); });", HTML)

    def test_fast_swipe_is_taken(self):
        # 周回159(運営者の声 2026-11-10・実機 iPhone「素早くスワイプすると反応しない」)
        # カードの 上では ブラウザに 指を わたさない(ななめの 速い フリックが 縦スクロール あつかいで 取り消されない)
        m = re.search(r"^#swCard\{[^}]*\}", HTML, re.M)
        self.assertIn("touch-action:none", m.group(0))
        self.assertNotIn("touch-action:pan-y", m.group(0))
        # 0.3秒 以内の 一筆(36px 以上)は 決める。押しただけ では 決めない(36px 以上が 要る)
        # のぞいて 引き戻した 動き(いちばん 遠い 所から 8px より 多く 戻った)は 決めない(Codex 指摘 PR #1084)
        self.assertIn("quick = !cancel && durAll >= 0 && durAll <= 300 && Math.abs(dx) >= Math.max(36, (dragW || 320) * 0.1) && Math.abs(dx) >= maxAx - 8;", HTML)
        self.assertIn("maxAx = Math.max(maxAx, Math.abs(e.clientX - startX));", HTML)
        self.assertIn("if (quick) flick = true;", HTML)
        # 速い フリックは ななめ(横が 縦の 0.7倍 以上)でも 決める
        self.assertIn("Math.abs(dx) < dyGuard * (cancel ? 1.5 : flick ? 0.7 : 1)", HTML)

    def test_demo_waits_for_judge_mark(self):
        # Codex 指摘(PR #1085): ○✗ の しるしが 出て いる 間は 手本を 待つ
        # 周回161: 待ちなおしは しるしの 残りの 時間だけ(0.3秒きざみで 待ちなおすと、しるしから 0.9秒 かかる)
        self.assertIn("var markLeft = 750 - (performance.now() - markAt); if (markLeft > 0) { demoArm(markLeft); return; }", HTML)
        self.assertNotIn("if (performance.now() - markAt < 750) { demoArm(); return; }", HTML)
        self.assertIn("function demoArm(ms){ demoDisarm();", HTML)
        self.assertIn("}, ms > 0 ? ms : (demoMiss > 0 || demoOk < 3) ? DEMO_STOP_MS : DEMO_STOP_OK_MS); }", HTML)
        self.assertIn("markAt = performance.now();", HTML)

    def test_swipe_during_fly_is_kept(self):
        # 周回161: 前の カードが 飛んで いる 間(busy・約0.2秒)に 置いた 指を 捨てない。おぼえて おき、次の カードで 同じ 順に 流しなおす
        down = HTML[HTML.index("el.card.addEventListener('pointerdown'"):HTML.index("el.card.addEventListener('pointermove'")]
        self.assertIn("pend = e.button > 0 ? null : [pendCopy(e)];", down)
        self.assertNotIn("if (busy || e.button > 0", down)
        move = HTML[HTML.index("el.card.addEventListener('pointermove'"):HTML.index("function up(e){")]
        self.assertIn("if (pend && !pendRun && e.pointerId === pend[0].pointerId) { var pl = null;", move)   # 周回167: 流しなおして いる 間(pendRun)の 動きは おぼえに 足さない
        up = HTML[HTML.index("function up(e){"):HTML.index("el.card.addEventListener('pointerup', up)")]
        self.assertIn("if (pend && !pendRun && e && e.pointerId === pend[0].pointerId) { pend.push(pendCopy(e)); return; }", up)
        # 流しなおすのは 次の カードが 出た あと。決める きまりは up の まま(押しただけ では 決まらない)
        self.assertIn("setTimeout(function(){ advance(side); pendFlush(); }, dur);", HTML)
        flush = HTML[HTML.index("function pendFlush(){"):HTML.index("el.card.addEventListener('pointerdown'")]
        # 周回167: 離し終わった 動きの 列(pendQ)から 古い 順に、無ければ さいごの 指(pend)を 流しなおす
        self.assertIn("var q = pendQ.length ? pendQ.shift() : pend; if (q === pend) pend = null;", flush)
        self.assertIn("busy || startX != null", flush)
        self.assertIn("cardDown(q[0]);", flush)
        self.assertIn("else { up(q[qi]); break; }", flush)
        self.assertNotIn("choose(", flush)
        # 時刻は もとの 指の 時刻を 使う(速さ・0.3秒の 一筆の 見分けが くるわない)
        self.assertIn("timeStamp: evT(e)", HTML)

    def test_pending_swipe_review_fixes(self):
        # Codex 指摘(PR #1087): 隠れたら 捨てる・まとめられた 点も おぼえる・2本目の 指で 消さない
        # 周回167: 隠れたら、列(pendQ)と 指の おぼえ(touchSet)も 捨てる
        self.assertIn("document.addEventListener('visibilitychange', function(){ if (document.hidden) { pend = null; pendQ.length = 0; touchSet.clear(); } });", HTML)
        self.assertIn("if (document.hidden || !card || !f || KomeCards.over(f) || $('sGame').classList.contains('hidden')) { pend = null; pendQ.length = 0; return; }", HTML)
        self.assertIn("pl = e.getCoalescedEvents ? e.getCoalescedEvents() : null;", HTML)
        # 周回167: 2本目の 指は fingerIn が 見る(休んで いる 指の ほかに 来た 指は おぼえる・2本とも 動いて いれば おぼえを 消す)
        self.assertIn("cardDown = function(e){ var solo = pendRun || fingerIn(e);", HTML)
        self.assertIn("if (busy) { if (!solo) return;", HTML)
        self.assertNotIn("if (busy) { if (e.isPrimary === false) return;", HTML)
        self.assertIn("(v > 0) === (dx > 0) && Math.abs(dx) >= maxAx - 12;", HTML)   # 速く のぞいて 引き戻した 動きは フリックと しない
        self.assertIn("if (pend) { try { el.card.setPointerCapture(e.pointerId); } catch (x) {} }", HTML)   # おぼえはじめた ときも つかまえる

    def test_demo_timer_does_not_count_hidden_tab(self):
        # Codex指摘(PR #1082): 別のタブに いる間は 手本の 待ちを 数えない。戻ったら 数え直す
        self.assertIn("if (document.hidden) { demoHeld = !!demoT; demoDisarm(); } else if (demoHeld) { demoHeld = false; demoArm(); }", HTML)

    def test_demo_shows_whenever_player_stops(self):
        # 周回158(運営者の声 2026-11-10「手本は、止まって見ているときにかならず出ていること」):
        # 何枚目でも・前に決めた人でも、決めずに止まっていたら約2秒で手本を出す(うまくできている人は6秒に延ばすだけ)
        self.assertIn("var DEMO_STOP_MS = 300, DEMO_STOP_OK_MS = 300, demoT = null, demoMiss = 0, demoOk = 0;", HTML)   # 周回160(運営者の声 2026-11-10「スワイプのお手本をすぐにだす」): 2秒・6秒 → 0.3秒
        arm = HTML[HTML.index("function demoArm(ms){"):HTML.index("window.addEventListener('resize', function(){ if ($('swWrap')")]
        self.assertIn("demoSet(true)", arm)
        self.assertIn("(demoMiss > 0 || demoOk < 3) ? DEMO_STOP_MS : DEMO_STOP_OK_MS", arm)
        # 出す条件に「何枚目まで」「まだ決めていない人だけ」を入れない
        self.assertNotIn("choices.length", arm)
        self.assertNotIn("demoDone", arm)
        # カードが出たとき(render)と、決めずに離したとき(ghostBack)に数えはじめる
        self.assertIn("demoSet(demoWant()); demoArm();   /* 周回155", HTML)
        self.assertIn("function ghostBack(){ demoMiss++; demoArm();", HTML)
        # 触れている間・スワイプで決めたときは止める
        self.assertIn("function ghostPause(){ demoSet(false); demoDisarm();", HTML)
        self.assertIn("demoSet(false); demoDisarm(); demoMiss = 0; demoOk++;", HTML)

    def test_reduced_motion_demo_shows_direction(self):
        # 周回158: 動きを減らす設定では、手本(止まった指)が出ている間 何枚目でも 丸い ◀ ▶ を一緒に出す
        self.assertIn("@media (prefers-reduced-motion: reduce){#swWrap.demoOn #swGuide{display:block!important}}", HTML)

    def test_owner_rules_kept(self):
        # 店主の指示(2026-11-08・11-09)で入れたものは そのまま
        self.assertIn("#swWhy.on{animation:swWhyIn 2s ease-out both}", HTML)
        self.assertIn('<i class="swHintSh L" aria-hidden="true"></i><i class="swHintSh R" aria-hidden="true"></i>', HTML)
        # タップでは選ばない・カードを動かさない(2026-11-09): 指を離したときの分かれ道は choose か reset だけ
        self.assertNotIn("toggleDetail(); } else { reset()", HTML)
        self.assertIn("#swVib,#swHelp,#swJudge,#swBanner,#swMonth,#swHint,#swLog,#swRewind,#swDetailBtn,#swCard.hinting #swHint{display:none!important}", HTML)

    def test_3d_files_wait_for_first_card(self):
        # 周回164(おそい回線): カードが出るまで 3D のファイル(three.js・field3d.js)を取りに行かない
        self.assertNotIn('<script src="field3d.js"></script>', HTML)
        self.assertIn('<script src="engine.js"></script>\n<script src="cards.js"></script>\n<script>', HTML)
        loader = HTML[HTML.index("window.__k3d = (function(){"):HTML.index("const K = window.Kome365")]
        self.assertIn("l.rel = 'preload'; l.as = 'script';", loader)
        self.assertIn("add('field3d.js');", loader)
        self.assertIn("if (!no3d) add('vendor/three.min.js', SRI, function(){ window.dispatchEvent(new Event('three-ready')); });", loader)
        self.assertLess(loader.index("add('field3d.js');"), loader.index("add('vendor/three.min.js'"))
        self.assertIn("sc.async = false;", loader)
        self.assertIn("sha512-dLxUelApnYxpLt6K2iomGngnHO83iUvZytA3YjDUCjT0HDOHKXnVYdf3hU4JjM8uEhxf9nD1/ey98U3t2vZ0qQ==", loader)
        # 読みこみの はじめに すぐ three.js を足す書き方は もう無い
        self.assertNotIn("sc.src = 'vendor/three.min.js'; sc.async = true;", HTML)

    def test_3d_setup_waits_for_first_swipe(self):
        # 周回164(おそいスマホ): はじめての人は 1枚目を決めた 0.9秒あと か、さわらずに 8秒で 3D のしたくを はじめる
        choose = HTML[HTML.index("function choose(side, vel){"):HTML.index("function choose(side, vel){") + 260]
        self.assertIn("window.__k3d.soon(900);", choose)
        # はじめての人の 道(周回164)は そのまま。つづきの人の 道は 周回167 で 同じ 待ち方に した(下の test_returning_player_3d_waits_too)
        self.assertIn("} else { guideFresh = true; $('bStart').click(); guideFresh = false; window.__k3d.pre(); window.__k3d.idle(8000); }", HTML)
        loader = HTML[HTML.index("window.__k3d = (function(){"):HTML.index("const K = window.Kome365")]
        # 指が画面にある間は はじめない(待つのは 12回まで)
        self.assertIn("if (down && tries++ < 12) { timer = setTimeout(tick, 400); return; } go();", loader)
        self.assertIn("if (st === 2 || timer) return;", loader)   # 速く決めつづけても 3D の開始をのばさない
        self.assertIn("if (down) idleArm(); else go();", loader)

    def test_boot_title_has_moving_dot(self):
        # 周回164: 読みこみ中の題字の下で 丸が動く(transform だけ・押す物ではない)
        self.assertIn('html.booting #sTitle h1::after{content:"";display:block;width:8px;height:8px;margin:16px auto 0;border-radius:50%;background:#6f9a3f;animation:bootDot .8s ease-in-out infinite alternate}', HTML)
        self.assertIn("@keyframes bootDot{from{transform:translateX(-20px)}to{transform:translateX(20px)}}", HTML)
        self.assertIn("@media (prefers-reduced-motion:reduce){html.booting #sTitle h1::after{animation:none}}", HTML)

    def test_swipe_from_field_reaches_card(self):
        # 周回165: カードの 上の 田んぼ(#swStage)に 置いた 指も、カードに 置いた 指と 同じ 入口(cardDown)を 通る
        i = HTML.index("el.card.addEventListener('pointerup', up); el.card.addEventListener('pointercancel', up);")
        blk = HTML[i:i + 2600]
        self.assertIn("document.addEventListener('pointerdown', function(e){", blk)
        self.assertIn("if (t.closest('#swCard') || !(onPic || t.closest('#swStage'))) return;", blk)
        # 顔を なでる 指・かかしを 押す 指(finger)、ボタン、「お疲れ様です」の カードは 取らない
        # 周回167: カードを 持って いる 指が あっても cardDown へ 通す(2本の 指の きまりは fingerIn)
        self.assertIn("|| !fingerReady() || finger) return;", blk)
        self.assertIn("if (t.closest('button, a, input, select, textarea, [role=\"button\"], #swDetail, #swIdle')) return;", blk)
        self.assertIn("cardDown(e);", blk)
        # 決める きまりは 1つ(up)。田んぼ用の choose は 作らない
        self.assertNotIn("choose(", blk[:blk.index("cardDown(e);")])
        # 周回167: 田んぼも none(pan-y だと、田んぼからの 45°より 急な フリック・はじめが 上下へ それた スワイプを ブラウザが 取り消して いた)。カードは none の まま(周回159)
        self.assertIn("min-height:0;touch-action:none}", css_rule("#swStage") + "}")
        self.assertNotIn("touch-action:pan-y", css_rule("#swStage"))
        self.assertIn("touch-action:none", css_rule("#swCard"))

    def test_cancel_without_place_does_not_decide(self):
        # 周回165: 場所が (0,0) の 取り消し(pointercancel)を「左へ 大きく 動いた」と 見ない。さいごに 届いた 動きの 場所で 見る
        up = HTML[HTML.index("  function up(e){"):HTML.index("el.card.addEventListener('pointerup', up);")]
        fix = "if (e && e.type === 'pointercancel' && e.clientX === 0 && e.clientY === 0 && startX != null && e.pointerId === pid) e = { type: 'pointercancel', pointerId: e.pointerId, timeStamp: e.timeStamp, clientX: samples.length ? samples[samples.length - 1][1] : startX, clientY: lastY != null ? lastY : startY };"
        self.assertIn(fix, up)
        # 指を はなした とき の 動き(sx0 を 取る 行)より 前に 直す
        self.assertLess(up.index(fix), up.index("var sx0 = startX"))
        # 取り消しは 横が 縦の 1.5倍 以上の ときだけ 決める きまりは そのまま
        self.assertIn("Math.abs(dx) < dyGuard * (cancel ? 1.5 : flick ? 0.7 : 1)", up)

    def test_round_arrows_do_not_pop_under_judge_mark(self):
        # 周回166: 丸い ◀ ▶ は 指を 置いて いる 間だけ。決めた あと ○✗ の しるしの 間(約0.7秒)だけ 出て、手本の 指と 入れかわる ちらつきを なくす
        self.assertIn("@media (prefers-reduced-motion: no-preference){#swWrap:not(:has(#swCard.drag)) #swGuide{display:none!important}}", HTML)
        # 手本が 出て いる 間は 出さない きまり・動きを 減らす 設定で いっしょに 出す きまりは そのまま
        self.assertIn("@media (prefers-reduced-motion: no-preference){#swWrap.demoOn #swGuide{display:none!important}}", HTML)
        self.assertIn("@media (prefers-reduced-motion: reduce){#swWrap.demoOn #swGuide{display:block!important}}", HTML)
        # 出す 枚数(2〜3枚目)の きまりは 変えない
        self.assertIn("$('swGuide').style.display = (guideLeft && choices.length < 3 && (choices.length >= 1 || calmOn())) ? 'block' : 'none';", HTML)

    def test_growth_dots_end_with_goal_picture(self):
        # 周回166: 育ちの 点の 列の さいごは「ごはん」の 絵(収穫ずみの 段階の 絵)。文字・数は 足さない
        self.assertIn("#swGrow .grDots i:last-child:not(.cur){width:16px;height:16px;margin:-3px 0 -3px 1px;border-radius:0;background:var(--grGoal,rgba(255,255,255,.55)) center/16px 16px no-repeat;image-rendering:pixelated}", HTML)
        self.assertIn("if (!gr.style.getPropertyValue('--grGoal')) gr.style.setProperty('--grGoal', 'url(\"' + pixGrowURL('done') + '\")');", HTML)
        # 点の 数・クラスの つけ方は 変えない(さいごの 段階に 着いたら 丸の まま)
        self.assertIn("return '<i class=\"' + (gc2.direct && i === 1 && gc2.idx >= 2 ? 'skip' : i < gc2.idx ? 'past' : i === gc2.idx ? 'cur' : '') + '\"></i>'; }).join('');", HTML)
        # 次の 節目の 日数は 60日より 先は 出さない きまり(周回94)の まま
        self.assertIn("mi && mi.days <= 60", HTML)

    def test_returning_player_3d_waits_too(self):
        # 周回167(2回目に 開いた 人・おそいスマホ): つづきの 人も、カードを 1枚 決めた 0.9秒あと か、さわらずに 8秒まで 3D の したくを はじめない
        self.assertIn("if (loadSave()) { resumeSwipe(); window.__k3d.pre(); if (f && !KomeCards.over(f)) window.__k3d.idle(8000); else window.__k3d.go(); } else {", HTML)
        # 開いて すぐ したくを はじめる 書き方は もう 無い
        self.assertNotIn("resumeSwipe(); window.__k3d.pre(); window.__k3d.go(); }", HTML)
        # 決めた とき(choose)の 0.9秒は、つづきの 人にも 同じ 所で かかる
        choose = HTML[HTML.index("function choose(side, vel){"):HTML.index("function choose(side, vel){") + 260]
        self.assertIn("window.__k3d.soon(900);", choose)

    def test_landscape_small_phone_keeps_card_clear(self):
        # 周回167(横向きの 小さい スマホ): 顔・育ち・かかし・天気を 左右の 空きへ 出す きまりを、幅564px から(640×360・568×320 で カードに かぶって いた)
        # 周回171: 顔(#swMood)と 挨拶の 顔(#swGreet)は 運営者の 声で 消した。育ち・かかし・天気を 左右へ 出す きまりは そのまま
        # 周回172: 育ちの 丸・天気の 丸は 運営者の 声で 消した。かかしを 右へ 出す きまりは そのまま
        self.assertIn("@media (max-height:440px) and (min-width:564px){#swKakashi{right:calc(10px - (100vw - 480px) / 2)}}", HTML)
        self.assertNotIn("(min-width:660px)", HTML)
        # 564px = カードの 幅 360px + 左右に いちばん 太い 列(もとは 顔の 92px)と 空き 10px ずつ
        self.assertEqual(360 + 2 * (92 + 10), 564)
        self.assertNotIn("#swMood", HTML)
        self.assertNotIn("#swGreet", HTML)

    # ---------- 周回167: 指の 入口を 本当に 動かして 見る ----------
    def test_two_finger_pinch_does_not_decide(self):
        # 田んぼの 絵・カードを 2本の 指で 広げても カードは 決まらない(直す 前は 先に 置いた 指の 動きで 決まった)
        for on in ("stage", "card"):
            for kw in ({}, {"each": 60, "ms": 250}, {"gap": 400}, {"each": 100, "ms": 800}):
                r = pointer_run(pinch(2000, on=on, **kw))
                self.assertEqual(r["chosen"], [], (on, kw))
                self.assertIsNone(r["holder"], (on, kw))
        # カードを 引いて いる ところへ 2本目が 来たら、カードは 元へ 戻る。1本目を そのまま 引いて 離しても 決まらない
        steps = stroke(1, 250, 640, -60, 0, 2000, ms=300, lift=False)
        steps += [["down", {"id": 2, "x": 120, "y": 330, "t": 2350, "on": "stage", "primary": False}]]
        steps += [["move", {"id": 1, "x": 190 - 12 * i, "y": 640, "t": 2400 + 40 * i}] for i in range(1, 7)]
        steps += [["up", {"id": 1, "x": 118, "y": 640, "t": 2700}], ["up", {"id": 2, "x": 120, "y": 330, "t": 2750, "on": "stage", "primary": False}]]
        r = pointer_run(steps)
        self.assertEqual(r["chosen"], [])
        self.assertGreaterEqual(r["stops"], 1)
        # ピンチの あと、ぜんぶ 離してから 1本で スワイプすれば 決まる(止まった ままに ならない)
        r = pointer_run(pinch(2000) + stroke(3, 250, 400, -120, 0, 3200, on="stage"))
        self.assertEqual(r["chosen"], ["left"])
        # ピンチの あと 1本だけ 離し、のこった 指を 横に 動かしても 決まらない(離すまで 持てない)
        steps = pinch(2000)[:-2] + [["up", {"id": 2, "x": 315, "y": 330, "t": 2400, "on": "stage", "primary": False}]]
        steps += [["move", {"id": 1, "x": 75 + 22 * i, "y": 330, "t": 2500 + 30 * i, "on": "stage"}] for i in range(1, 7)]
        steps += [["up", {"id": 1, "x": 207, "y": 330, "t": 2700, "on": "stage"}]]
        self.assertEqual(pointer_run(steps)["chosen"], [])

    def test_resting_finger_does_not_block_swipe(self):
        # 指を 1本 置いたまま(スマホを 持つ 親指)でも、ほかの 指の スワイプは 決まる(直す 前は 0/6)
        for on, x, y in (("card", 360, 815), ("stage", 200, 300)):
            rest = [["down", {"id": 1, "x": x, "y": y, "t": 2000, "on": on}]]
            r = pointer_run(rest + stroke(2, 250, 640, -120, 0, 3000, primary=False))
            self.assertEqual(r["chosen"], ["left"], on)
            # ゆっくり 130px
            r = pointer_run(rest + stroke(2, 260, 660, 130, 0, 3000, ms=700, primary=False, n=10))
            self.assertEqual(r["chosen"], ["right"], on)
            # 押しただけ・縦に 動かしただけ では 決まらない
            self.assertEqual(pointer_run(rest + stroke(2, 250, 640, 0, 0, 3000, primary=False))["chosen"], [], on)
            self.assertEqual(pointer_run(rest + stroke(2, 250, 520, 0, 120, 3000, ms=200, primary=False))["chosen"], [], on)
            # 休めた 指を 置いて すぐ(0.15秒 たたない)の 2本目は ピンチと 同じ(決まらない)
            self.assertEqual(pointer_run(rest + stroke(2, 250, 640, -120, 0, 2100, primary=False))["chosen"], [], on)
        # ほかの 指で 押した あと、休めて いた 指で そのまま スワイプ しても 決まる
        steps = [["down", {"id": 1, "x": 200, "y": 300, "t": 2000, "on": "stage"}]] + stroke(2, 250, 640, 0, 0, 3000, primary=False)
        steps += [["move", {"id": 1, "x": 200 - 22 * i, "y": 300, "t": 3600 + 30 * i, "on": "stage"}] for i in range(1, 7)] + [["up", {"id": 1, "x": 68, "y": 300, "t": 3800, "on": "stage"}]]
        self.assertEqual(pointer_run(steps)["chosen"], ["left"])
        # 2本とも 置いて 休んで いて、先に 置いた 指で スワイプ しても 決まる
        steps = [["down", {"id": 1, "x": 250, "y": 640, "t": 2000}], ["down", {"id": 2, "x": 330, "y": 330, "t": 2600, "on": "stage", "primary": False}]]
        steps += [["move", {"id": 1, "x": 250 - 22 * i, "y": 640, "t": 3200 + 30 * i}] for i in range(1, 7)] + [["up", {"id": 1, "x": 118, "y": 640, "t": 3400}]]
        self.assertEqual(pointer_run(steps)["chosen"], ["left"])
        # 休めた 指が 取り消された(pointercancel)あとも、次の 1本は 決まる
        steps = [["down", {"id": 1, "x": 360, "y": 815, "t": 2000}], ["cancel", {"id": 1, "x": 0, "y": 0, "t": 2800}]] + stroke(2, 250, 400, -120, 0, 3200, on="stage")
        self.assertEqual(pointer_run(steps)["chosen"], ["left"])

    def test_single_finger_rules_kept(self):
        # 1本の 指の きまりは 同じ: 速い フリック・ゆっくり 大きく は 決まる。押しただけ・縦・急な ななめ は 決まらない
        for on in ("card", "stage"):
            self.assertEqual(pointer_run(stroke(1, 250, 500, -120, 0, 2000, on=on))["chosen"], ["left"], on)
            self.assertEqual(pointer_run(stroke(1, 200, 500, 120, 0, 2000, on=on))["chosen"], ["right"], on)
            self.assertEqual(pointer_run(stroke(1, 250, 500, -130, 0, 2000, ms=900, on=on, n=12))["chosen"], ["left"], on)
            self.assertEqual(pointer_run(stroke(1, 250, 500, -85, -85, 2000, on=on))["chosen"], ["left"], on)   # 45°の フリック
            self.assertEqual(pointer_run(stroke(1, 250, 500, 0, 0, 2000, on=on))["chosen"], [], on)
            self.assertEqual(pointer_run(stroke(1, 250, 500, 0, 120, 2000, on=on))["chosen"], [], on)
            self.assertEqual(pointer_run(stroke(1, 250, 500, 0, -220, 2000, ms=300, on=on))["chosen"], [], on)
            self.assertEqual(pointer_run(stroke(1, 250, 500, -41, -113, 2000, on=on))["chosen"], [], on)   # 70°
            self.assertEqual(pointer_run(stroke(1, 250, 500, -10, 0, 2000, on=on))["chosen"], [], on)
        # ボタンを 押して いない マウスの 動きは 指では ない(窓の 外で 離した マウスを おぼえた ままに しない)
        self.assertIn("if (e.pointerType === 'mouse' && e.buttons === 0) { touchSet.up(id); return; }", HTML)
        # マウスの 右ボタンでは 動かない
        steps = stroke(1, 250, 640, -120, 0, 2000)
        steps[0][1]["button"] = 2
        self.assertEqual(pointer_run(steps)["chosen"], [])

    def test_judge_mark_survives_finger_returning_during_fly(self):
        # 前の カードが 飛んで いる 間に 置いた 指(流しなおし)では、○✗ の しるしを 片づけない(直す 前は 出したのと 同じ ときに 消えて 1コマも 出なかった)
        first = stroke(1, 250, 640, 120, 0, 2000)
        base = pointer_run(first)["markOff"]
        for on in ("card", "stage"):
            tap = [["down", {"id": 2, "x": 200, "y": 660, "t": 2150, "on": on}], ["up", {"id": 2, "x": 200, "y": 660, "t": 2240, "on": on}], ["land", 2300]]
            r = pointer_run(first + tap)
            self.assertEqual(r["markOff"], base, on)
            self.assertEqual(r["chosen"], ["right"], on)
            # 置いたまま(離さない)でも 同じ。カードは その 指に ついて くる
            r = pointer_run(first + tap[:1] + tap[2:])
            self.assertEqual(r["markOff"], base, on)
            self.assertEqual(r["holder"], 2, on)
        # しるしを 出して 0.4秒 たたない うちに 触っても 片づけない(飛んで いる 間と 人には 同じ)
        r = pointer_run(first + [["land", 2300], ["mark", 2300], ["down", {"id": 2, "x": 200, "y": 660, "t": 2400}]])
        self.assertEqual(r["markOff"], base)
        # 0.4秒 たった あとで 次の カードに 触ったら、これまで どおり すぐ 片づける(今の きまり)
        r = pointer_run(first + [["land", 2300], ["mark", 2300], ["down", {"id": 2, "x": 200, "y": 660, "t": 2700}]])
        self.assertEqual(r["markOff"], base + 1)
        self.assertIn("if (!pendRun && evT(e) - markAt >= 400) { var mk0 = $('swMark'); if (mk0) mk0.classList.remove('on'); var wy0 = $('swWhy'); if (wy0) wy0.classList.remove('on'); }", HTML)
        # しるしの 長さ(0.75秒)・✗ の わけの 長さ(2秒)は 変えない
        self.assertIn("#swMark.on{animation:swMarkIn .75s ease-out both}", HTML)
        self.assertIn("#swWhy.on{animation:swWhyIn 2s ease-out both}", HTML)

    def test_quick_flicks_wait_in_short_queue(self):
        # 画面が 止まった あと まとめて 届いた フリックは、古い 順に 1枚ずつ 決まる(直す 前は 3回 送って 2回)
        def run(k, lands, extra=()):
            steps = []
            for g in range(k):
                steps += stroke(10 + g, 195, 700, 120 if g % 2 else -120, 0, 2000 + 300 * g, ms=95)
            return pointer_run(steps + list(extra) + [["land", 5000 + 400 * i] for i in range(lands)])
        self.assertEqual(run(3, 4)["chosen"], ["left", "right", "left"])
        self.assertEqual(run(5, 6)["chosen"], ["left", "right", "left", "right", "left"])
        # 1枚 出る たびに 1つ(いちどに 2枚 進まない)
        self.assertEqual(len(run(4, 1)["chosen"]), 2)
        self.assertEqual(len(run(4, 2)["chosen"]), 3)
        # 列は 3つまで(決めた 1回 + 列の 3つ + さいごの 1つ = 5回まで)
        self.assertEqual(len(run(8, 9)["chosen"]), 5)
        # 隠れたら 列ごと 捨てる
        self.assertEqual(run(4, 5, extra=[["hide"]])["chosen"], ["left"])
        # 列の 中の 押しただけ では 決まらず、次の 動きへ 進む
        steps = stroke(1, 195, 700, -120, 0, 2000, ms=95) + stroke(2, 195, 700, 0, 0, 2300, ms=60) + stroke(3, 195, 700, 120, 0, 2600, ms=95) + [["land", 5000], ["land", 5400]]
        self.assertEqual(pointer_run(steps)["chosen"], ["left", "right"])
        self.assertIn("pendQ.length < 3) pendQ.push(pend);", HTML)

    def test_swipe_from_idle_buttons_reaches_card(self):
        # 「お疲れ様です」の カードの ボタンの 上から はじめた 横スワイプも 決まる(直す 前は 0/8)。押しただけ なら カードは つかまない(ボタンが 押せる)
        r = pointer_run(stroke(1, 250, 452, -120, 0, 2000, on="idle"))
        self.assertEqual(r["chosen"], ["left"])
        self.assertGreaterEqual(r["idleTouch"], 1)
        r = pointer_run(stroke(1, 250, 452, 3, 2, 2000, on="idle", lift=False))
        self.assertEqual(r["chosen"], [])
        self.assertIsNone(r["holder"])
        self.assertEqual(pointer_run(stroke(1, 250, 452, 0, 120, 2000, on="idle"))["chosen"], [])
        self.assertIn("#swIdle[data-on] button,#swIdle[data-on] a{pointer-events:auto;touch-action:none}", HTML)

    @staticmethod
    def _two_then_one(on):
        # 2本を 10ms ずらして 置く → 2本とも 20px 動く → 190ms あと、1本だけ 横へ 120px 動いて 離す(もう 1本は 置いた まま)
        s = [["down", {"id": 1, "x": 120, "y": 452, "t": 2000, "on": on}], ["down", {"id": 2, "x": 290, "y": 452, "t": 2010, "on": on, "primary": False}]]
        s += [["move", {"id": 1, "x": 100, "y": 452, "t": 2060, "on": on}], ["move", {"id": 2, "x": 310, "y": 452, "t": 2060, "on": on, "primary": False}]]
        s += [["move", {"id": 1, "x": 100 - 20 * i, "y": 452, "t": 2250 + 15 * i, "on": on}] for i in range(1, 7)]
        return s + [["up", {"id": 1, "x": -20, "y": 452, "t": 2350, "on": on}]]

    @staticmethod
    def _down_then_side(on, dy=100, dx=40):
        # 置く → 50ms あと 縦に dy → 50ms あと 横に dx → 離す(ぜんたいは 縦の 動き)
        return [["down", {"id": 1, "x": 200, "y": 452, "t": 2000, "on": on}], ["move", {"id": 1, "x": 200, "y": 452 + dy, "t": 2050, "on": on}],
                ["move", {"id": 1, "x": 200 + dx, "y": 452 + dy, "t": 2100, "on": on}], ["up", {"id": 1, "x": 200 + dx, "y": 452 + dy, "t": 2104, "on": on}]]

    def test_two_moved_fingers_stay_out_until_lifted(self):
        # Codex 指摘(周回167): 2本とも 動いた あとは、1本が 止まって もう 1本が 動いても、離すまで カードを 持てない。ボタンの 上から はじめた 指でも 同じ
        for on in ("idle", "stage", "card", "field"):
            r = pointer_run(self._two_then_one(on))
            self.assertEqual(r["chosen"], [], on)
            self.assertIsNone(r["holder"], on)
        # 離して 置きなおせば 決まる
        s = self._two_then_one("idle") + [["up", {"id": 2, "x": 310, "y": 452, "t": 2400, "on": "idle", "primary": False}]] + stroke(3, 250, 452, -120, 0, 3000, on="idle")
        self.assertEqual(pointer_run(s)["chosen"], ["left"])
        self.assertIn("if (had || !calm) touchSet.bar();", HTML)

    def test_takeover_keeps_start_point_and_history(self):
        # Codex 指摘(周回167): あとから カードを 持った 指も、置いた 所からの 動きで 見る(縦に 100px 引いて 横へ 40px では 決まらない)
        for on in ("idle", "stage", "card", "field"):
            self.assertEqual(pointer_run(self._down_then_side(on))["chosen"], [], on)
            self.assertEqual(pointer_run(self._down_then_side(on, dy=-100, dx=-40))["chosen"], [], on)
            # 縦が 小さければ 横の スワイプ(同じ 道すじで 縦 10px・横 120px)
            self.assertEqual(pointer_run(self._down_then_side(on, dy=10, dx=120))["chosen"], ["right"], on)
        # 休めて いた 指(カードを ゆずった あと)が 縦に 動いてから 横へ 少し 動いても 決まらない。横に 大きく 動かせば 決まる
        for on in ("stage", "card"):
            rest = [["down", {"id": 1, "x": 200, "y": 500, "t": 2000, "on": on}]] + stroke(2, 250, 640, 0, 0, 3000, primary=False)
            v = [["move", {"id": 1, "x": 200, "y": 600, "t": 3600, "on": on}], ["move", {"id": 1, "x": 240, "y": 600, "t": 3650, "on": on}], ["up", {"id": 1, "x": 240, "y": 600, "t": 3654, "on": on}]]
            self.assertEqual(pointer_run(rest + v)["chosen"], [], on)
            h = [["move", {"id": 1, "x": 200 - 22 * i, "y": 500, "t": 3600 + 30 * i, "on": on}] for i in range(1, 7)] + [["up", {"id": 1, "x": 68, "y": 500, "t": 3800, "on": on}]]
            self.assertEqual(pointer_run(rest + h)["chosen"], ["left"], on)
        # のぞいて 引き戻した 動き(ボタンの 上から 60px 出て 20px まで 戻る)も、置いた 所から 見て 決まらない
        peek = [["down", {"id": 1, "x": 200, "y": 452, "t": 2000, "on": "idle"}]] + [["move", {"id": 1, "x": 200 + 15 * i, "y": 452, "t": 2000 + 20 * i, "on": "idle"}] for i in range(1, 5)]
        peek += [["move", {"id": 1, "x": 260 - 10 * i, "y": 452, "t": 2080 + 20 * i, "on": "idle"}] for i in range(1, 5)] + [["up", {"id": 1, "x": 220, "y": 452, "t": 2170, "on": "idle"}]]
        self.assertEqual(pointer_run(peek)["chosen"], [])
        self.assertIn("cardDown({ type: 'pointerdown', pointerId: id, clientX: g.x0, clientY: g.y0, timeStamp: g.t0, button: 0, isPrimary: e.isPrimary });", HTML)
        self.assertIn('<a id="swIdleHome" draggable="false" href="https://ricepia.jp/?from=kome365-idle">', HTML)

    def test_side_picture_reaches_card_in_2d(self):
        # カードの 列の 外の 絵(#field)から はじめた スワイプ: 2D の 間は 決まる(横向き・タブレット・PC。直す 前は 0/8・0/16)
        self.assertEqual(pointer_run(stroke(1, 300, 200, -120, 0, 2000, on="field"))["chosen"], ["left"])
        self.assertEqual(pointer_run(stroke(1, 600, 200, 120, 0, 2000, on="field"))["chosen"], ["right"])
        # 3D の 絵は 見回しが 使う・画面の はし 16px は これまで どおり
        self.assertEqual(pointer_run([["3d"]] + stroke(1, 300, 200, -120, 0, 2000, on="field"))["chosen"], [])
        self.assertEqual(pointer_run(stroke(1, 8, 200, 120, 0, 2000, on="field"))["chosen"], [])
        self.assertEqual(pointer_run(stroke(1, 838, 200, -120, 0, 2000, on="field"))["chosen"], [])
        # ヘッダーなど ほかの 所は 取らない
        self.assertEqual(pointer_run(stroke(1, 300, 20, -120, 0, 2000, on="top"))["chosen"], [])
        self.assertIn("z-index:0;touch-action:none}", HTML)
        self.assertIn("var onPic = t.id === 'field' && use3d !== true && $('sGame').classList.contains('swipeMode') && e.clientX >= 16 && e.clientX <= window.innerWidth - 16;", HTML)

    def test_idle_card_buttons_do_not_trap_finger(self):
        # 「いいね」→「ありがとう」で ボタンの 幅が 変わらない(行が 折り返して リンクが 指の 下へ 来ない)
        self.assertIn("#swIdleLike .idleTx{display:inline-block;min-width:5em;text-align:center}", HTML)
        self.assertEqual(len("ありがとう"), 5)
        # 出はじめの まだ うすい 間(濃さ 0.5 未満)・「いいね」の すぐ あと 0.8秒は、リンクを 押した ことに しない
        self.assertIn("function idleFaint(){ try { return +getComputedStyle($('swIdle')).opacity < 0.5; } catch (x) { return false; } }", HTML)
        self.assertIn("function idleEarly(ev){ if (!idleFaint() && performance.now() - (idleInfo.likedAt || -1e9) >= 800) return false; if (ev && ev.preventDefault) ev.preventDefault(); return true; }", HTML)
        self.assertIn("$('swIdleHome').addEventListener('click', function(ev){ if (idleEarly(ev)) return; idleInfo.home++;", HTML)
        self.assertIn("if (idleInfo.liked || idleFaint()) return;", HTML)
        self.assertIn("idleInfo.liked = true; idleInfo.likedAt = performance.now();", HTML)
        # 出て いる 間に 画面を 回したら 置きなおす
        self.assertIn("window.addEventListener('resize', function(){ if (idleInfo.shown) idlePlace($('swIdle')); });", HTML)
        # 出る 秒(30秒)・文字は 変えない
        self.assertIn("var IDLE_MS = 30000,", HTML)
        self.assertIn('<p id="swIdleSay">お疲れ様です</p>', HTML)
        self.assertIn('<span class="idleTx">いいね</span>', HTML)
        self.assertIn('<span class="idleTx">サイトへもどる</span>', HTML)

    def test_3d_loader_counts_fingers(self):
        # 2本目の 指を 離しても、1本目が 画面に ある 間は 3D の したくを はじめない(指は 数で 数える)
        loader = HTML[HTML.index("window.__k3d = (function(){"):HTML.index("const K = window.Kome365")]
        self.assertIn("var st = 0, down = 0, timer = null,", loader)
        self.assertIn("document.addEventListener('pointerdown', function(e){ down = (e && e.isPrimary === false) ? down + 1 : 1; idleArm(); }, true);", loader)
        self.assertIn("document.addEventListener(t, function(){ down = Math.max(0, down - 1); }, true);", loader)
        self.assertIn("document.addEventListener('visibilitychange', function(){ if (document.hidden) down = 0; });", loader)
        self.assertNotIn("down = false", loader)


    def test_stalled_game_script_shows_retry(self):
        # 周回168: engine.js・cards.js が 返事を しない(つながった まま 止まる)と、題字と 丸 だけで 61秒 たっても 何も 出なかった。
        # 見はりは いちばん 上の インライン スクリプト(ゲームの スクリプトが 来なくても 動く)
        # 周回169: ゲームの スクリプト(engine.js・cards.js)が まだ 動いて いない 間は、おそいのか 止まったのか 分からない。20秒 待って から 出す(0.5秒ごとに 見る)
        r = boot_run({"until": 24000, "events": [[300, "grow"], [600, "file"]]})
        self.assertIsNotNone(r["firstOn"])
        self.assertGreaterEqual(r["firstOn"], 20600)
        self.assertLessEqual(r["firstOn"], 21200)
        self.assertTrue(r["endOn"])
        self.assertIn("よみこみに 時間が かかって います", r["text"])
        self.assertIn("このまま 待つか、タップで やりなおし", r["text"])
        self.assertNotIn("止ま", r["text"])
        # 押すと 読みこみなおす
        r = boot_run({"until": 22000, "events": [[300, "grow"], [21500, "tap"]]})
        self.assertEqual(r["reloads"], 1)
        # スクリプトは 動いたのに 始まらない(止まった)ときは これまで どおり 8秒
        r = boot_run({"until": 12000, "events": [[300, "grow"], [600, "file"], [600, "scripts"]]})
        self.assertGreaterEqual(r["firstOn"], 8600)
        self.assertLessEqual(r["firstOn"], 9200)
        # 20秒の わけ: 2つの スクリプトを 約 50KB/秒(おそい 3G)で 取っても 約 4.2秒(圧縮なし)
        root = os.path.join(ROOT, "kome365")
        kb = (os.path.getsize(os.path.join(root, "engine.js")) + os.path.getsize(os.path.join(root, "cards.js"))) / 1000
        self.assertLess(kb / 50 * 4, 20)
        head = HTML[:HTML.index('<script src="engine.js">')]
        self.assertIn("w.__komeBoot = {", head)
        self.assertLess(HTML.index("w.__komeBoot = {"), HTML.index("<style>"))

    def test_trickling_game_script_is_not_called_stopped(self):
        # 周回169: engine.js が 10〜15秒 かけて 少しずつ 届く(おそいが 進んで いる)と、8.6〜9.2秒で「タップで もう一度」が 出て、押すと 0 から 取りなおして 8.1〜8.8秒 おそく なった(6/6)
        for t in (10000, 12000, 15000, 19000):
            r = boot_run({"until": t + 3000, "events": [[300, "grow"], [600, "file"], [t, "file"], [t, "scripts"], [t + 50, "grow"], [t + 300, "ready"]]})
            self.assertIsNone(r["firstOn"], t)
            self.assertFalse(r["endOn"], t)
        # cards.js だけ おそい(engine.js は 動いた)ときも 同じ
        r = boot_run({"until": 18000, "events": [[300, "grow"], [500, "file"], [14000, "file"], [14000, "scripts"], [14300, "ready"]]})
        self.assertIsNone(r["firstOn"])
        # 読めなかった(エラー)ときは これまで どおり すぐ
        r = boot_run({"until": 4000, "events": [[300, "grow"], [500, "scriptError", "cards.js"]]})
        self.assertEqual(r["firstOn"], 500)

    def test_normal_and_slow_loads_show_nothing(self):
        # ふつうの 読みこみ(すぐ 始まる)・おそくても 進んで いる 読みこみ・ページの 本体が まだ 届いて いる 途中(20秒まで)は 何も 出さない
        self.assertIsNone(boot_run({"until": 60000, "events": [[300, "grow"], [900, "ready"]]})["firstOn"])
        steps = [[t, "grow"] for t in range(0, 40000, 6000)] + [[40500, "ready"]]
        self.assertIsNone(boot_run({"until": 60000, "events": steps})["firstOn"])
        self.assertIsNone(boot_run({"until": 19000, "navEnd": 10 ** 9, "events": [[300, "grow"]]})["firstOn"])
        # おそいだけで 出た 知らせは、ゲームが 始まったら 消える
        r = boot_run({"until": 24000, "events": [[300, "grow"], [22000, "ready"]]})
        self.assertIsNotNone(r["firstOn"])
        self.assertGreaterEqual(r["firstOn"], 20000)
        self.assertFalse(r["endOn"])
        # 絵が 読めないのは 見ない
        self.assertIsNone(boot_run({"until": 5000, "events": [[300, "grow"], [500, "imgError"], [900, "ready"]]})["firstOn"])
        # ゲームが 始まった あとの エラー・3D の スクリプトの 失敗でも 出さない
        self.assertIsNone(boot_run({"until": 20000, "events": [[300, "grow"], [900, "ready"], [3000, "runError"], [3100, "scriptError", "field3d.js"]]})["firstOn"])

    def test_failed_game_script_shows_retry_at_once(self):
        # engine.js が 失敗すると、題の 画面の いちばん 上の ボタンが から(文字なし)で、知らせも なかった。今は すぐ 出す・ゲームの さいごまで 進んでも 消さない
        for name in ("engine.js", "cards.js", "engine.js?v=2"):
            r = boot_run({"until": 4000, "events": [[300, "grow"], [500, "scriptError", name], [700, "tail", 1]]})
            self.assertEqual(r["firstOn"], 500, name)
            self.assertTrue(r["endOn"], name)
        # エラーが 無くても、さいごの 行で ゲームが 始まって いなければ すぐ 出す
        r = boot_run({"until": 4000, "events": [[300, "grow"], [700, "tail"]]})
        self.assertEqual(r["firstOn"], 700)
        self.assertTrue(r["endOn"])

    def test_unrelated_error_does_not_cover_booted_game(self):
        # Codex 指摘(周回168): 始まる 前の 関係ない エラー(ブラウザの 拡張など)で 知らせが 出て、ゲームが ふつうに 始まっても 消えなかった
        r = boot_run({"until": 12000, "events": [[300, "grow"], [400, "runError"], [700, "ready"]]})
        self.assertIsNone(r["firstOn"])
        self.assertFalse(r["endOn"])
        r = boot_run({"until": 12000, "events": [[300, "grow"], [400, "runError"], [700, "readyResult"]]})
        self.assertIsNone(r["firstOn"])
        # おそくて 出た 知らせも、エラーの あと 本当に 始まれば 消える
        r = boot_run({"until": 14000, "events": [[300, "grow"], [350, "scripts"], [400, "runError"], [12000, "ready"]]})
        self.assertIsNotNone(r["firstOn"])
        self.assertFalse(r["endOn"])
        # エラーで 止まって 始まらなければ、8秒の 見はりで 出る
        r = boot_run({"until": 12000, "events": [[300, "grow"], [350, "scripts"], [400, "runError"]]})
        self.assertGreaterEqual(r["firstOn"], 8400)
        self.assertLessEqual(r["firstOn"], 9000)
        self.assertTrue(r["endOn"])

    def test_boot_retry_visible_with_reduced_motion(self):
        # 知らせは 動かない 文字(動きを減らす 設定でも 同じに 見える)。画面の どこを 押しても 読みこみなおす
        rule = css_rule("#bootSlow")
        self.assertIn("position:fixed;inset:0", rule)
        self.assertNotIn("animation", rule)
        self.assertNotIn("#bootSlow", "".join(re.findall(r"@media \(prefers-reduced-motion[^{]*\{[^\n]*", HTML)))
        # ゲームが 始まった ところ(さいごの スクリプトの はじめの 1枚の あと)で 見はりを やめる
        tail = HTML[HTML.rindex("if (loadSave()) { resumeSwipe();"):]
        self.assertIn("window.__k3d.idle(8000); }\n  if (window.__komeBoot) window.__komeBoot.ready();", tail)
        # これまでの 読みこみ中の 丸は そのまま
        self.assertIn("@media (prefers-reduced-motion:reduce){html.booting #sTitle h1::after{animation:none}}", HTML)

    def test_short_portrait_weather_clears_card_date(self):
        # 周回168: 320×568 で 季節の 景色・今日の 天気・あしたの 空が 日付に かぶって いた(24枚中 22・12・5枚)。
        # 周回171 で 景色、周回172 で 天気の 丸・あしたの 空の 丸を 運営者の 声で 消した(「左上や右上の丸いアイコンはなんなんのか分からない。削除」)。かぶる もの そのものが 無い
        self.assertNotIn("#swSeasonScene", HTML)
        self.assertNotIn("#swSkyWx", HTML)
        self.assertNotIn("#swAheadWx", HTML)
        self.assertNotIn("@media (min-height:441px) and (max-height:600px) and (min-width:301px) and (max-width:480px){#swSkyWx", HTML)
        # 横向きで かかしを 右の 空きへ 出す きまりは そのまま
        self.assertIn("@media (max-height:440px) and (min-width:564px){#swKakashi{right:calc(10px - (100vw - 480px) / 2)}}", HTML)

    def test_rotation_mid_drag_does_not_decide(self):
        # 周回169: 指で カードを 持った まま 画面を 回すと(取り消しは 来ない)、カードが 指と とんで 決まった(2/2)
        hold = [["down", {"id": 1, "x": 195, "y": 640, "t": 1000}], ["move", {"id": 1, "x": 201, "y": 640, "t": 1080}]]
        jump = [["move", {"id": 1, "x": 662, "y": 189, "t": 1500}], ["move", {"id": 1, "x": 700, "y": 189, "t": 1560}], ["up", {"id": 1, "x": 700, "y": 189, "t": 1580}]]
        r = pointer_run(hold + [["resize", 390]] + jump)   # にせの 画面は 幅 844 から 始まる
        self.assertEqual(r["chosen"], [])
        self.assertIsNone(r["holder"])
        self.assertFalse(r["dragging"])
        self.assertEqual(r["dx"], 0)
        self.assertGreaterEqual(r["stops"], 1)   # 手本は 戻る
        # 次の スワイプは ふつうに 効く
        r = pointer_run(hold + [["resize", 390]] + jump + stroke(2, 420, 250, -150, 0, 3000))
        self.assertEqual(r["chosen"], ["left"])
        # 回して いない(幅が 同じ)ときは これまで どおり 指で 決まる
        self.assertEqual(pointer_run(hold + [["resize", 844]] + jump)["chosen"], ["right"])   # 高さ だけ の 変化(幅 844 の まま)
        self.assertEqual(pointer_run(hold + jump)["chosen"], ["right"])
        # 指が 無い ときに 回しても 何も しない
        self.assertEqual(pointer_run([["resize", 390]] + stroke(1, 200, 640, 150, 0, 2000))["chosen"], ["right"])

    def test_unknown_save_keys_start_fresh(self):
        # 周回169: 記録の 年(y)が engine の 一覧に 無いと 始まる ところで 止まり、やりなおしても 同じだった。合わない 記録は 記録 なし と して、別の 名前に のこす
        node = shutil.which("node")
        if not node:
            raise unittest.SkipTest("node がないので実行の確認は飛ばす")
        js = r"""
const fs = require('fs'), path = require('path');
const html = fs.readFileSync(process.argv[1], 'utf8');
const K = require(process.argv[2]);
// loadSave は いつも 取り出す(直す 前の 版でも 同じ 確かめまで 進む)。saveOk は ある ときだけ
const l = html.indexOf('  function loadSave(){');
if (l < 0) { console.log(JSON.stringify({ error: 'no loadSave' })); process.exit(0); }
const code = html.slice(l, html.indexOf('\n', l)), s0 = html.indexOf('  function saveOk(o){');
const db = {}; const store = { get(k){ return k in db ? db[k] : null; }, set(k, v){ db[k] = v; } }; const SAVE = 'kome365_swipe_save';
eval((s0 >= 0 && s0 < l ? html.slice(s0, l) : '') + code);
const out = [];
for (const o of JSON.parse(process.argv[3])) { for (const k in db) delete db[k]; db[SAVE] = typeof o === 'string' ? o : JSON.stringify(o); const r = loadSave(); out.push({ ok: !!r, bad: db[SAVE + '_bad'] || null, kept: db[SAVE] }); }
console.log(JSON.stringify(out));
"""
        base = {"v": "kaori", "y": "normal", "so": "mid", "m": "transplant", "c": 0, "s": 7, "fm": "", "yh": 0, "ch": "LR"}
        cases = [base, dict(base, y="zzz"), dict(base, v="old_variety"), dict(base, so="rock"), dict(base, m="air"), dict(base, y="constructor"),
                 dict(base, v=None, y=None, so=None, m=None), {k: v for k, v in base.items() if k not in ("v", "y", "so", "m")}, dict(base, y="cool", v="koshi", m="direct", so="high"), "{broken",
                 dict(base, ch="LRX"), dict(base, ch=5), dict(base, fm="zzz"), dict(base, fm="split", ch=""), {k: v for k, v in base.items() if k != "fm"}]
        out = subprocess.run([node, "-e", js, HTML_PATH, os.path.join(ROOT, "kome365", "engine.js"), json.dumps(cases)], capture_output=True, text=True)
        if out.returncode != 0:
            raise AssertionError(out.stderr[-2000:])
        r = json.loads(out.stdout.strip().splitlines()[-1])
        self.assertNotIn("error", r)
        self.assertEqual([x["ok"] for x in r], [True, False, False, False, False, False, True, True, True, False, False, False, False, True, True])
        for i in (1, 2, 3, 4, 5, 10, 11, 12):
            # 消さない: 別の 名前に のこる(もとの 名前も その まま。新しい 田んぼの 1枚目で 上書き される)
            self.assertEqual(json.loads(r[i]["bad"]), cases[i], i)
            self.assertEqual(json.loads(r[i]["kept"]), cases[i], i)
        self.assertIsNone(r[0]["bad"])
        self.assertIsNone(r[9]["bad"])

    def test_cards_behind_sink_while_finger_down(self):
        # 周回169(案1): 指を 置いた とたん(動かす 前)、後ろの 2枚が 2・3px 沈む。translate だけ(ならびは 動かない)。動きを減らす 設定では 沈めない
        # 指を 置いた ところで drag が つく(タップで 選ばない・手本は これまで どおり)
        self.assertIn("try { pvCompute(); } catch (x) {} el.card.classList.add('drag');", HTML)
        r = pointer_run([["down", {"id": 1, "x": 195, "y": 640, "t": 1000}]])
        self.assertTrue(r["dragging"])
        self.assertEqual(r["chosen"], [])
        r = pointer_run([["down", {"id": 1, "x": 195, "y": 640, "t": 1000}], ["up", {"id": 1, "x": 196, "y": 640, "t": 1090}]])
        self.assertFalse(r["dragging"])
        self.assertEqual(r["chosen"], [])
        # drag の 間 後ろの 札を 何px 沈めるか(CSS の きまりを 読む。無ければ 0)
        sink = {b: int(m.group(1)) if m else 0 for b in ("b1", "b2") for m in [re.search(r"#swCard\.drag ~ \.swBack\." + b + r"\{translate:0 (\d+)px\}", HTML)]}
        self.assertEqual(sink, {"b1": 2, "b2": 3}, "指を 置いても 後ろの 札が 動かない")
        self.assertIn("@media (prefers-reduced-motion: reduce){#swCard.drag ~ .swBack.b1,#swCard.drag ~ .swBack.b2{translate:none}}", HTML)
        self.assertIn("#swCard.drag ~ .swBack{transition:none}", HTML)   # 置いた その コマで 変わる


    # ---------- 周回171: 田んぼの 絵(#swPaddy)。周回170 の 芽の 列の 点は 運営者の 声で 消した ので、その 手ごたえ(○ の たびに 変わる・ふくらむ)を 土の 絵で 確かめる ----------
    def test_paddy_soil_changes_every_ok(self):
        # 冬の 土: ○ の たびに 絵が 変わる(だんご 6つで 土の 色が 1段 よく なる・4段。その あとも つや・みみずで 変わりつづける)。✗ では 変わらない
        steps = [{"ok": 0, "len": 0}] + [{"ok": i, "len": i} for i in range(1, 71)] + [{"ok": 70, "len": 71}]
        r = paddy_run(steps)
        self.assertEqual(r[0]["base"], "soil")
        changed = [i for i in range(1, 71) if r[i]["key"] != r[i - 1]["key"]]
        self.assertEqual(changed, list(range(1, 71)), "○ を 重ねても 絵が 変わらない ○ が ある")
        self.assertEqual(r[71]["key"], r[70]["key"])   # ✗(○ の 数は 同じ)
        self.assertFalse(r[71]["pop"])
        self.assertEqual([r[i]["lv"] for i in (0, 5, 6, 12, 18, 23, 24, 70)], [0, 0, 1, 2, 3, 3, 4, 4])
        # ふえた 印は ふくらむ(段が 上がった ○ は 色が かわる だけ)
        for i in range(1, 71):
            self.assertEqual(r[i]["pop"], not (i < 25 and i % 6 == 0), i)
        self.assertTrue(all(x["bg"] for x in r))

    def test_paddy_pop_rules_follow_cycle170(self):
        # 周回170 の きまりを 引きつぐ: 同じ 判定の 中の 描きなおしでは ふくらみを 引きつぐ・手が 終わった あと(保存から もどる・あとの 描きなおし)では ふくらまない
        r = paddy_run([{"ok": 0, "len": 0}, {"ok": 1, "len": 1}, {}, {"tick": True}, {"ok": 2, "len": 2}, {"tick": True}, {}])
        self.assertEqual([x["pop"] for x in r], [False, True, True, False, True, False, False])
        # 保存から もどった(はじめての 描きが ○ 9つの 状態): ふくらまない。つぎの ○ は ふくらむ
        r = paddy_run([{"ok": 9, "len": 15}, {"tick": True}, {"ok": 10, "len": 16}])
        self.assertEqual([x["pop"] for x in r], [False, False, True])

    def test_paddy_follows_farm_state(self):
        # どの 状態で どの 絵か(エンジンの 状態を 写す だけ)。機械は その 作業を した 手から 2枚の 間 だけ 走る
        T = "transplant"
        steps = [
            {"ok": 3, "len": 10, "f": {"method": T, "doy": 100}},                                   # 0 冬の 土
            {"len": 11, "f": {"sowDoy": 101, "phase": "nursery", "doy": 101}},                         # 1 苗箱
            {"len": 12, "f": {"tillDepth": 15, "doy": 102}},                                          # 2 田起こし → トラクター
            {"len": 13, "f": {"doy": 103}},                                                           # 3 まだ 走る(2枚め)
            {"len": 14, "f": {"doy": 104}},                                                           # 4 もう 走らない
            {"len": 15, "f": {"puddleDoy": 115, "doy": 115}},                                         # 5 代かき → トラクター
            {"len": 16, "f": {"transDoy": 120, "phase": "field", "doy": 120}},                         # 6 田植え
            {"len": 17, "f": {"doy": 140}},                                                           # 7 分げつ
            {"len": 18, "f": {"piDoy": 180, "doy": 180}},                                             # 8 穂の もと
            {"len": 19, "f": {"headDoy": 210, "doy": 210}},                                           # 9 出穂
            {"len": 20, "f": {"matDoy": 250, "doy": 250}},                                            # 10 実り
            {"len": 21, "f": {"harvestDoy": 252, "phase": "harvested", "doy": 252}},                   # 11 稲刈り → コンバイン
            {"len": 22, "f": {"doy": 253}},                                                           # 12 まだ 走る
            {"len": 23, "f": {"doy": 254}},                                                           # 13 刈り株
            {"len": 24, "wx": "rain"},                                                                # 14 雨
        ]
        r = paddy_run(steps)
        self.assertEqual([x["base"] for x in r], ["soil", "soil", "till", "till", "till", "puddle", "nae", "kuki", "moto", "head", "ripe", "stubble", "stubble", "stubble", "stubble"])
        self.assertEqual([x["veh"] for x in r], ["", "", "tractor", "tractor", "", "tractor", "", "", "", "", "", "combine", "combine", "", ""])
        self.assertEqual([x["nursery"] for x in r], [False, True, True, True, True, True, False, False, False, False, False, False, False, False, False])
        self.assertTrue(r[2]["trail"] and r[11]["trail"])   # 走った うしろの 絵(耕した あと・刈った あと)
        self.assertEqual([x["wet"] for x in r], [False] * 14 + [True])
        # 保存から もどった ときは 機械を 出さない(はじめての 描きで もう 耕して ある)
        r = paddy_run([{"ok": 5, "len": 30, "f": {"method": T, "doy": 110, "sowDoy": 95, "tillDepth": 15}}, {"len": 31}])
        self.assertEqual([x["veh"] for x in r], ["", ""])
        self.assertEqual(r[0]["base"], "till")
        # 直播: 種の 列 → 芽(出芽)→ 入水の あとは 稲の 絵(苗の 段は 通らない)
        D = {"method": "direct", "doy": 90, "sowDoy": 90, "transDoy": 90, "tillDepth": 15, "puddleDoy": 90, "emergeDoy": None, "flooded": None}
        r = paddy_run([{"ok": 2, "len": 5, "f": D}, {"len": 6, "f": {"emergeDoy": 100, "doy": 100}}, {"len": 7, "f": {"flooded": 110, "doy": 110}}])
        self.assertEqual([x["base"] for x in r], ["dseed", "dsprout", "kuki"])
        self.assertEqual([x["veh"] for x in r], ["", "", ""])

    def test_paddy_shows_water_and_field_state(self):
        # Codex 指摘(周回171): 中干し(engine a_mid: f.water = 'mid')の あとも 青い 水面が のこって いた(絵の キーが 浅水と 同じ 'kuki')。field3d.js は 水面を 消して 乾いた 土を 見せる
        T = {"method": "transplant", "sowDoy": 95, "tillDepth": 15, "puddleDoy": 115, "transDoy": 120, "water": "shallow", "doy": 150}
        r = paddy_run([
            {"ok": 4, "len": 40, "f": T},                                                    # 0 浅水
            {"len": 41, "f": {"water": "mid", "midStart": 151, "doy": 152}},                  # 1 中干しの はじめ(しめった 土)
            {"len": 42, "f": {"doy": 160}},                                                   # 2 乾いた 土
            {"len": 43, "f": {"doy": 170}},                                                   # 3 ひび
            {"len": 44, "f": {"water": "intermittent", "doy": 172}},                          # 4 間断(水と 泥)
            {"len": 45, "f": {"water": "deep", "doy": 174}},                                  # 5 深水
            {"len": 46, "f": {"piDoy": 180, "water": "drained", "drainDoy": 181, "doy": 200}},  # 6 落水の あと(穂の もと)
        ])
        self.assertEqual([x["base"] for x in r], ["kuki"] * 6 + ["moto"])
        self.assertEqual([x["water"] for x in r], [True, False, False, False, True, True, False])
        self.assertEqual([x["cond"] for x in r], ["water", "wet", "fine", "crack", "inter", "deep", "crack"])
        self.assertTrue(r[3]["crack"])
        self.assertEqual(len({x["key"] for x in r}), 7)   # 水の 状態ごとに 絵が ちがう
        # 草・いもち病・ウンカの 坪枯れ・倒伏(見回りの 発見と エンジンの 状態)
        r = paddy_run([
            {"ok": 4, "len": 40, "f": T},
            {"len": 41, "pev": [{"kind": "hie", "fixed": False}]},
            {"len": 42, "pev": [{"kind": "hie", "fixed": True}, {"kind": "blast", "fixed": False}]},
            {"len": 43, "pev": [], "f": {"bphMax": 80}},
            {"len": 44, "f": {"headDoy": 210, "matDoy": 250, "lodged": True, "bphMax": 0, "doy": 252}},
        ])
        self.assertEqual([x["cond"] for x in r], ["water", "waterW", "waterB", "waterU", "waterL"])
        self.assertEqual(r[4]["base"], "ripe")

    def test_paddy_ground_table_every_stage(self):
        # Codex 指摘(周回171・2回め): 穂の もと・出穂では 地面を「水 か 土 か」だけで えらび、しめった 土・乾いた 土・ひび(浅水・深水・間断も)が 同じ 絵に なって いた。
        # 地面は 1つの 関数(pdGround)で 描き、その 上に 稲を 重ねる。ぜんぶの 段階 × ぜんぶの 水の 状態で「キーが ちがえば 絵も ちがう」を 表で 回す
        base = {"method": "transplant", "sowDoy": 95, "tillDepth": 15, "puddleDoy": 115, "doy": 200}
        stages = {"nae": {"transDoy": 195}, "kuki": {"transDoy": 160}, "moto": {"transDoy": 120, "piDoy": 180},
                  "head": {"transDoy": 120, "piDoy": 170, "headDoy": 190}, "ripe": {"transDoy": 120, "piDoy": 160, "headDoy": 175, "matDoy": 198}}
        waters = {"water": {"water": "shallow"}, "deep": {"water": "deep"}, "inter": {"water": "intermittent"},
                  "wet": {"water": "drained", "drainDoy": 199}, "fine": {"water": "drained", "drainDoy": 190}, "crack": {"water": "drained", "drainDoy": 180}}
        flags = {"": {}, "W": {"pev": [{"kind": "hie", "fixed": False}]}, "B": {"pev": [{"kind": "blast", "fixed": False}]}, "U": {"f": {"bphMax": 80}}, "L": {"f": {"lodged": True}}}
        clear = {"transDoy": None, "piDoy": None, "headDoy": None, "matDoy": None, "water": None, "drainDoy": None, "midStart": None, "bphMax": 0, "lodged": False}
        steps, names = [], []
        for st, sf in stages.items():
            for w, wf in waters.items():
                for fl, ff in flags.items():
                    if fl == "L" and st not in ("head", "ripe"):
                        continue   # エンジンは 出穂の あとだけ 倒伏を 立てる
                    if fl in ("W", "B") and st in ("head", "ripe"):
                        continue   # 草・いもち病の しるしは 出穂 前だけ(field3d.js も 同じ)
                    f = dict(base); f.update(clear); f.update(sf); f.update(wf); f.update(ff.get("f", {}))
                    steps.append({"ok": 3, "len": len(steps) + 1, "f": f, "pev": ff.get("pev", [])})
                    names.append((st, w, fl))
        r = paddy_run(steps)
        by = {}
        for (st, w, fl), x in zip(names, r):
            self.assertEqual(x["base"], st, (st, w, fl))
            self.assertEqual(x["cond"], w + fl, (st, w, fl))
            by[(st, w, fl)] = x
        # 同じ 段階の 中: キーが ちがえば 絵(ドットの 並び)も ちがう(水の ある どうし・無い どうしも)
        for st in stages:
            imgs = {}
            for (s2, w, fl), x in by.items():
                if s2 != st:
                    continue
                self.assertNotIn(x["img"], imgs, "%s: %s と %s が 同じ 絵" % (st, (w, fl), imgs.get(x["img"])))
                imgs[x["img"]] = (w, fl)
            # 水の ある 状態は 水の 色、無い 状態は 水の 色 なし(地面の すきまで 見える)
            for w in waters:
                self.assertEqual(by[(st, w, "")]["water"], w in ("water", "deep", "inter"), (st, w))
            self.assertTrue(by[(st, "crack", "")]["crack"], st)
        # 段階ごとに 地面の 分かれ道を 持たない(地面を えらぶ のは pdGround だけ)
        code = HTML[HTML.index("  function pdPlants(g, kind){"):HTML.index("    /* 田んぼの ようす(見回りの 発見")]
        self.assertEqual(code.count("pdGround("), 1)
        self.assertNotIn("pdWater", code)
        self.assertNotIn("pdWet(", code)

    def test_paddy_machine_shows_before_and_after(self):
        # Codex 指摘(周回171・3回め): 代かきの トラクターが 走る 2枚で、通る 前(.pdBase)と 通った あと(.pdTrail)が 同じ 絵 だった(前がわに 作業の あとの 地面を わたして いた)。
        # 機械が 出る ぜんぶの 切りかわりで: 前がわ = 作業の 直前に 描いた 絵(冬の 土の 段・かたまり・地面・稲)、あとがわ = 作業の あとの 絵、2つは ちがう、2枚の あとは あとの 絵 1つ
        T = {"method": "transplant", "sowDoy": 95, "doy": 100}
        cases = [
            ("冬の 土 → 田起こし", {"ok": 7, "f": dict(T)}, {"f": {"tillDepth": 15, "doy": 101}}, "tractor", "soil", "till"),
            ("田起こし → 代かき", {"ok": 7, "f": dict(T, tillDepth=15)}, {"f": {"puddleDoy": 115, "doy": 115}}, "tractor", "till", "puddle"),
            ("実り → 稲刈り", {"ok": 7, "f": dict(T, tillDepth=15, puddleDoy=115, transDoy=120, piDoy=180, headDoy=200, matDoy=240, water="drained", drainDoy=230, doy=245)},
             {"f": {"harvestDoy": 246, "doy": 246}}, "combine", "ripe", "stubble"),
        ]
        for wx in ("fair", "rain"):
            for name, before, work, veh, b0, b1 in cases:
                tag = name + " " + wx
                st0 = dict(before, len=10, wx=wx)
                r = paddy_run([dict(st0, len=9), st0, dict(work, len=11, wx=wx), {"len": 12, "wx": wx}, {"len": 13, "wx": wx}])
                self.assertEqual([x["base"] for x in r], [b0, b0, b1, b1, b1], tag)
                self.assertEqual([x["veh"] for x in r], ["", "", veh, veh, ""], tag)
                self.assertEqual(r[2]["img"], r[1]["img"], tag + ": 前がわは 作業の 直前の 絵")
                self.assertEqual(r[3]["img"], r[1]["img"], tag + ": 2枚めも 前がわは 同じ")
                self.assertNotEqual(r[2]["trailImg"], r[2]["img"], tag + ": 前と あとは ちがう 絵")
                self.assertEqual(r[4]["img"], r[2]["trailImg"], tag + ": 機械が 消えたら あとの 絵 1つ")
                self.assertEqual(r[4]["trailImg"], "", tag)
                # あとの 絵は、保存から 開いて その 状態を 描いた ときと 同じ(雨の 水たまり・すじも 正しい)
                after = dict(before["f"]); after.update(work["f"])
                fresh = paddy_run([{"ok": before["ok"], "len": 30, "f": after, "wx": wx}])
                self.assertEqual(fresh[0]["img"], r[2]["trailImg"], tag)
                self.assertEqual(fresh[0]["veh"], "", tag)   # 保存から もどった ときは 機械なし
                self.assertEqual(r[2]["wet"], wx == "rain", tag)
        # 冬の 土 → 田起こし: 前がわは ○ を 重ねた 冬の 土の まま(○ 7つ = 段 1・かたまり 1)
        r = paddy_run([{"ok": 7, "len": 9, "f": dict(T)}, {"ok": 7, "len": 10}, {"ok": 8, "len": 11, "f": {"tillDepth": 15, "doy": 101}}])
        soil7 = paddy_run([{"ok": 7, "len": 50, "f": dict(T)}])[0]["img"]
        self.assertEqual(r[2]["img"], soil7)
        # 走った 所 だけ あとの 絵が 見える(のぞき窓と 中身を 逆に ずらす)・動きを へらす 設定では 止まって あとの 絵が ぜんぶ 見える
        self.assertIn("#swPaddy[data-veh] .pdWin{display:block;animation:swPdWin 3.6s linear infinite}", HTML)
        self.assertIn("@keyframes swPdWin{from{transform:translateX(-100%)}to{transform:none}}", HTML)
        self.assertIn("@keyframes swPdWinIn{from{transform:translateX(100%)}to{transform:none}}", HTML)

    def test_paddy_reads_as_rice_field(self):
        # 周回172(運営者の声「茶色い四角では田んぼだとわかりにくいのでわかりやすく」): ななめ上から 見た 田んぼ。冬の 土(○ 0)でも、草の 畦・刈り株の 列・水路の 青が 見える
        r = paddy_run([{"ok": 0, "len": 0, "f": {"method": "transplant", "doy": 20}}, {"ok": 12, "len": 1}])
        for x in r:
            px = x["pix"]
            grass = sum(1 for v in px.values() if v in ("#8fd45a", "#4e9b3a"))
            water = [k for k, v in px.items() if v in ("#57b6f2", "#2f7fd0") and int(k.split(",")[1]) <= 4]
            stubble = [k for k, v in px.items() if v == "#d9b46a" and 5 <= int(k.split(",")[1]) <= 13]
            self.assertGreaterEqual(grass, 60, "畦の 草が すくない")
            self.assertGreaterEqual(len(water), 20, "奥の 水路・水口が 無い")
            self.assertGreaterEqual(len(stubble), 40, "刈り株の 列が 無い")
            # 台形: 奥(y=5)の 田は 手前(y=13)より せまい
            row = lambda y: [int(k.split(",")[0]) for k, v in px.items() if int(k.split(",")[1]) == y and v not in ("#8fd45a", "#4e9b3a", "#9c7a45", "#7e6136")]
            self.assertLess(max(row(5)) - min(row(5)), max(row(13)) - min(row(13)))
            # 手前の 畦に 高さ(土手の 面)
            self.assertTrue(any(v == "#5f4528" for k, v in px.items() if k.endswith(",17")))
        # ○ 0 の 土は 砂場に 見えない こい めの 茶(明るさ 0.5 未満)
        soil = [v for k, v in r[0]["pix"].items() if 5 <= int(k.split(",")[1]) <= 13 and 12 <= int(k.split(",")[0]) <= 31 and v not in ("#d9b46a", "#a88b55")]
        light = lambda h: (int(h[1:3], 16) * 299 + int(h[3:5], 16) * 587 + int(h[5:7], 16) * 114) / 255000
        from collections import Counter
        main = Counter(soil).most_common(1)[0][0]
        self.assertLess(light(main), 0.5, main)

    def test_round_icons_removed_dots_kept_above_paddy(self):
        # 周回172(運営者の声「左上や右上の丸いアイコンはなんなんのか分からない。削除」): 育ちの 丸の 絵・天気の 丸・あしたの 空は 消した。育ちの 点の 列は 田んぼの 絵の すぐ 上へ(いまは 残す・運営者に 聞いて いる)
        wrap = HTML[HTML.index('<div id="swWrap">'):HTML.index('<div id="swCard"')]
        self.assertIn('<div id="swGrow" aria-hidden="true"><span class="grDots"></span></div>', wrap)
        self.assertIn("#swGrow{position:absolute;left:calc(50% + var(--pdx));bottom:calc(100% + var(--pdb) + var(--pd) * 18 + 4px);", HTML)
        # 点の 列も 消す と 決まったら、この 1行を 足す だけ(CSS)
        self.assertNotIn("#swGrow{display:none!important}", HTML)
        for gone in ("swSkyWx", "swAheadWx", "aheadWxInfo", "grIc", "pixWxSet("):
            self.assertNotIn(gone, HTML, gone)
        # 今日の 天気の 読みは 田んぼの 絵の 雨の ために 残す
        self.assertIn("skyWxInfo = { icon: w.icon, key: wk, text: w.text, temp: w.temp, rain: w.rain };", HTML)

    def test_landscape_and_short_screens_keep_paddy_clear(self):
        # 周回172: 横の 低い 画面では カードの 上の 帯が 太陽の 通り道・仲間・収穫まで の 日数で いっぱいで、絵が かくれて いた(568×320 で 太陽 156枚・日数 27枚)。カードの 左の 空きへ
        self.assertIn("@media (max-height:440px) and (min-width:564px){#swWrap #swPaddy{left:auto;right:calc(100% + 8px);margin-left:0;bottom:auto;top:14px}", HTML)
        self.assertIn("@media (max-height:440px){#sGame #swCount{left:auto;right:12px;top:8px;transform:none}", HTML)
        # カードの うしろの 稲の 列は 絵の 下の 端より 低く(株の 先は カードの 上 46px・36px)
        self.assertIn('#swStagePlants[data-stage="4"] .pl,#swStagePlants[data-stage="5"] .pl{font-size:min(56px,16.7vw)}', HTML)
        self.assertLessEqual(56 - 10, 48 - 2)
        self.assertLessEqual(46 - 10, 38 - 2)
        # 背の 高い 画面では その日の 生きもの・再会の 生きものを 絵(と 点の 列)より 上へ
        self.assertIn("@media (min-height:741px){#swDayGuest{top:calc(36% - 120px)}}", HTML)
        self.assertIn("#swReunion{top:calc(36% - 120px);left:34%}", HTML)

    def test_paddy_drawn_in_pixels_only(self):
        # 字・数字・音は 足さない。動きは transform だけ・動きを へらす 設定では 止める(絵は 見える)
        code = HTML[HTML.index("  var PDPAL = {"):HTML.index("  /* 小さな再会(周回125", HTML.index("  var PDPAL = {"))]
        for bad in ("textContent", "innerText", "innerHTML", "AudioContext", "SND", "sndChirp"):
            self.assertNotIn(bad, code, bad)
        for kf in re.findall(r"@keyframes swPd\w+\{[^\n]*", HTML):
            self.assertNotRegex(kf, r"(left|top|width|height|opacity|margin)\s*:", kf)
        self.assertIn("@media (prefers-reduced-motion: reduce){#swPaddy[data-veh] .pdWin,#swPaddy[data-veh] .pdTrail,#swPaddy[data-wet] .pdRain,#swPaddy .pdPop.on{animation:none}#swPaddy[data-veh] .pdVeh{animation:none;transform:translateX(calc(var(--pd) * 30))}}", HTML)
        self.assertIn("#swPaddy .pdPop.on{display:block;animation:swPdPop .3s ease-out .7s 1 both}", HTML)   # 0.3秒 ふくらむ(大きな ○ が 消える ころ)
        # 機械の 色は 青みの 緑(特定の メーカーの 赤・橙・青・黄に しない)・ロゴ なし
        self.assertIn("t: '#5f9ea0', T: '#3f7476'", code)

    def test_paddy_fits_six_screens_in_browser(self):
        # 6つの 画面 × 1年の 6つの 場面(保存から 開く): 田んぼの 絵は 見えて 画面の 中、カード・札・日付・手本の 手・かかし・天気の 丸・生きもの・⌂・土の タイルの 列・育ちの 丸 に 重ならない
        node = shutil.which("node")
        if not node:
            raise unittest.SkipTest("node がないので実行の確認は飛ばす")
        vps = [[320, 568], [360, 640], [390, 844], [568, 320], [844, 390], [820, 1180]]
        out = subprocess.run([node, "-e", PADDY_BROWSER_JS, HTML_PATH, ROOT, json.dumps(vps), json.dumps(PADDY_SAVES)], capture_output=True, text=True, timeout=1200)
        if out.returncode != 0:
            raise AssertionError(out.stderr[-2000:])
        r = json.loads(out.stdout.strip().splitlines()[-1])
        if isinstance(r, dict) and r.get("skip"):
            raise unittest.SkipTest(r["skip"])
        expect = {"rain": "soil", "nursery": "soil", "nae": ("nae", "kuki"), "head": "head", "ripe": "ripe", "stubble": "stubble"}
        sun_hits = []
        for x in r:
            name = "%dx%d %s%s" % (x["w"], x["h"], x["name"], " reduce" if x["rm"] else "")
            self.assertNotIn("hidden", x, name + ": 田んぼの 絵が 見えない")
            self.assertEqual(x["errs"], 0, name)
            self.assertEqual(x["removed"], [], name)
            self.assertTrue(x["inView"], name + " %r" % (x["box"],))
            self.assertFalse(x["hscroll"], name)
            # 周回172: 太陽は 運営者が「のこす」と 決めた・通り道で かかる ことが ある。見ない のでは なく 数え、下で 上の かぎりと くらべる
            sun = x["over"].pop("swSun", 0)
            if sun:
                sun_hits.append(name)
            self.assertEqual(x["over"], {}, name + ": 重なり %r" % (x["over"],))
            self.assertIn("swCard", x["seen"], name)   # 機械で 集めた 部品の 中に カードが ある(集め方が こわれて いない)
            e = expect[x["name"]]
            self.assertIn(x["base"], e if isinstance(e, tuple) else (e,), name)
            if x["name"] == "rain":
                self.assertTrue(x["wet"], name)
                self.assertEqual(x["rainAnim"], "none" if x["rm"] else "swPdRain", name)
        self.assertLessEqual(len(sun_hits), SUN_HITS_MAX, "太陽が 田んぼの 絵に かかる 場面が ふえた: %r" % (sun_hits,))


class TestKome365Sound(unittest.TestCase):
    """サイクル173(運営者の声 2026-11-12「米作り３６５にほのぼのした音を入れる」。それまでの「音なし」は 運営者 本人が 変えた)"""

    @classmethod
    def setUpClass(cls):
        cls.r = sound_run([
            {"name": "decide", "acts": ["L", "R", "L"], "box": True},
            {"name": "reduce", "reduce": True, "acts": ["L"]},
            {"name": "mute", "acts": ["L", "mute", "R", "L", "wait", "reload", "R"]},
            {"name": "hide", "acts": ["L", "wait", "hide", "wait", "show", "wait"]},
            {"name": "loadTap", "mode": "lateAllow", "loadTap": True, "acts": ["allow", "L"]},
            {"name": "noaudio", "mode": "none", "acts": ["L", "R", "mute", "L"]},
            {"name": "throw", "mode": "throw", "acts": ["L", "R"]},
            {"name": "storeThrow", "store": "throw", "acts": ["L", "mute", "R"]},
            {"name": "storeJunk", "store": "junk", "acts": ["L"]},
        ])

    def steps(self, name):
        x = self.r[name]
        self.assertEqual(x["errs"], [], name)
        return {k: v for k, v in x["steps"]}, x["steps"]

    def test_no_sound_before_touch_then_pon_and_answer(self):
        d, seq = self.steps("decide")
        self.assertEqual(d["ready"]["fa"]["osc"], 0)            # さわる まで 音を 作らない(はじめの プログラムの click でも 作らない)
        self.assertEqual(d["ready"]["fa"]["made"], 0)
        self.assertTrue(d["ready"]["ks"]["on"])                  # はじめは 入り
        self.assertEqual(d["ready"]["btn"], "🔊")
        self.assertGreater(seq[-1][1]["fa"]["osc"], seq[0][1]["fa"]["osc"], "決めても 音を 作って いない")
        log = seq[-1][1]["ks"]["log"]
        self.assertEqual(log.count("pon"), 3, log)              # 決めた 3回 → ぽん 3回
        self.assertEqual(sum(1 for k in log if k in ("ok", "ng")), 3, log)   # ○/✗ の 音も 毎回
        self.assertGreater(seq[-1][1]["fa"]["osc"], seq[0][1]["fa"]["osc"])
        self.assertEqual(seq[-1][1]["ks"]["ctx"], "running")
        self.assertTrue(seq[-1][1]["ks"]["bgm"])                 # うしろの ふしも 鳴る
        self.assertGreater(seq[-1][1]["ks"]["fx"].get("bgm", 0), 0)
        self.assertNotEqual(seq[0][1]["date"], seq[-1][1]["date"])   # 音を 入れても カードは 進む
        b = self.r["decide"]["box"]
        self.assertGreaterEqual(b[2], 44)
        self.assertGreaterEqual(b[3], 44)

    def test_reduced_motion_does_not_mute(self):
        d, seq = self.steps("reduce")
        self.assertGreater(seq[-1][1]["fa"]["osc"], 0)
        self.assertIn("pon", seq[-1][1]["ks"]["log"])

    def test_mute_button_silences_and_is_saved(self):
        d, seq = self.steps("mute")
        after = dict(seq)
        m = after["mute"]
        self.assertFalse(m["ks"]["on"])
        self.assertEqual(m["btn"], "🔇")
        self.assertEqual(m["store"], "0")
        self.assertFalse(m["ks"]["bgm"])
        i = [k for k, _ in seq].index("mute")
        later = seq[-3][1]   # 切った あと 2枚 はじいて 2.5秒 待った ところ
        self.assertEqual(later["fa"]["osc"], m["fa"]["osc"], "🔇 の あとに 音を 作った")
        self.assertNotEqual(later["date"], m["date"])
        re_ = after["reload"]
        self.assertFalse(re_["ks"]["on"])                       # 開きなおしても 切りの まま
        self.assertEqual(re_["btn"], "🔇")
        self.assertEqual(seq[-1][1]["fa"]["osc"], 0)

    def test_hidden_page_stops_sound_and_comes_back(self):
        d, seq = self.steps("hide")
        h = [v for k, v in seq if k == "hide"][0]
        self.assertGreater(h["fa"]["suspend"], 0)
        self.assertFalse(h["ks"]["bgm"])
        w = seq[4][1]   # かくれた まま 2.5秒
        self.assertEqual(w["fa"]["osc"], h["fa"]["osc"], "かくれて いる 間に 音を 作った")
        s = [v for k, v in seq if k == "show"][0]
        self.assertTrue(s["ks"]["bgm"])
        self.assertGreater(seq[-1][1]["fa"]["osc"], s["fa"]["osc"])   # もどったら つづける

    def test_touch_while_loading_then_first_swipe_unlocks(self):
        d, seq = self.steps("loadTap")
        self.assertGreaterEqual(d["loadTap"]["fa"]["resume"], 1)     # 読みこみ中の 1回めは 解けなかった
        self.assertNotEqual(d["ready"]["ks"]["ctx"], "running")
        self.assertEqual(seq[-1][1]["ks"]["ctx"], "running")           # 始まって 最初の スワイプで 解ける
        self.assertIn("pon", seq[-1][1]["ks"]["log"])
        self.assertGreater(seq[-1][1]["fa"]["resume"], d["ready"]["fa"]["resume"])

    def test_plays_without_audio(self):
        for name in ("noaudio", "throw"):
            d, seq = self.steps(name)
            self.assertTrue(seq[-1][1]["ks"]["dead"], name)
            self.assertNotEqual(seq[0][1]["date"], seq[-1][1]["date"], name)   # 音なしで カードが 進む

    def test_broken_storage_still_starts_with_sound(self):
        for name in ("storeThrow", "storeJunk"):
            d, seq = self.steps(name)
            self.assertTrue(d["ready"]["ks"]["on"], name)
            self.assertTrue(d["ready"]["date"], name)
            self.assertIn("pon", d["L"]["ks"]["log"], name)
        d, seq = self.steps("storeThrow")
        self.assertFalse(d["mute"]["ks"]["on"])                          # 保存できなくても 切れる
        self.assertEqual(d["R"]["fa"]["osc"], d["mute"]["fa"]["osc"])

    def test_sound_rules_in_code(self):
        code = HTML[HTML.index("// ---------- ほのぼのした 音(サイクル173"):HTML.index("// ---------- 田んぼの音(はじめは消音。")]
        for bad in ("prefers-reduced-motion", "calmOn", ".mp3", ".ogg", ".wav", "http", "new Audio("):
            self.assertNotIn(bad, code, bad)                              # 動きを へらす 設定は 音に かけない・音の ファイルや 外の 部品なし
        self.assertIn("['pointerup', 'touchend', 'click', 'keydown'].forEach", code)
        self.assertNotIn("once: true", code)                              # 解けるまで 何度でも
        self.assertNotIn("removeEventListener", code)
        # 鳴らす だけ: 決めた とき・○✗・田んぼが 変わった とき・30秒の カード・1年の 区切り
        self.assertIn("busy = true; ksCancel(); ksFx('pon');", HTML)   # レビュー P2: 前の カードの 予約を 取り消してから ぽん
        self.assertIn("ksFx(ok ? 'ok' : 'ng'); vibJudge(ok);", HTML)
        self.assertIn("idleInfo.shown = true; ksFx('idle');", HTML)
        self.assertIn("showResult(); ksFx('year'); return; }", HTML)   # レビュー P2: 結果の 画面へ かわって(古い 予約を 取り消して)から 1年の ふし
        self.assertNotIn("sndJudge", HTML)



# 周回173 の 直し: 12月31日(365枚めの カード)の 保存。あと 1枚 決めると 結果の 画面
END_SAVE = '{\"v\":\"kokoro\",\"y\":\"recent\",\"so\":\"high\",\"m\":\"transplant\",\"c\":0,\"s\":206412282,\"fm\":\"oneshot\",\"yh\":0,\"ch\":\"LLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLL\"}'
VPS5 = [[320, 568], [390, 844], [568, 320], [844, 390], [820, 1180]]


class TestKome365SoundReview(unittest.TestCase):
    """サイクル173 の レビュー(PR #1127): 題・結果でも 音を 切れる／再開の 途中で 止める／予約した 音を 取り消す"""

    @classmethod
    def setUpClass(cls):
        plans = [
            {"name": "home", "acts": ["L", "home", "tapTgl", "wait"]},
            {"name": "result", "save": END_SAVE, "acts": ["L", "tapTgl", "wait"]},
            {"name": "slowPause", "mode": "slow", "acts": ["js:(ksUnlock(), ksPause(), 1)", "wait", "js:(window.dispatchEvent(new Event('focus')), 1)", "wait"]},
            {"name": "cancelHome", "acts": ["L", "js:(window.__ts = performance.now(), ksFx('grow', 0.45), window.__tc = performance.now(), window.__fa.live(window.__tc, window.__ts))", "home"]},
            {"name": "cancelNext", "acts": ["L", "js:(window.__ts = performance.now(), ksFx('rain', 0.45), window.__tc = performance.now(), window.__fa.live(window.__tc, window.__ts))", "keyL"]},
            {"name": "cancelResult", "save": END_SAVE, "acts": ["js:(ksUnlock(), 1)", "js:(window.__ts = performance.now(), ksFx('grow', 0.45), window.__tc = performance.now(), window.__fa.live(window.__tc, window.__ts))", "keyL", "wait"]},
        ]
        for w, h in VPS5:
            plans.append({"name": "t%dx%d" % (w, h), "w": w, "h": h, "acts": ["L", "home", "olap"]})
            plans.append({"name": "r%dx%d" % (w, h), "w": w, "h": h, "save": END_SAVE, "acts": ["L", "olap"]})
        cls.r = sound_run(plans)

    def seq(self, name):
        x = self.r[name]
        self.assertEqual(x["errs"], [], name)
        return x["steps"]

    def test_title_and_result_can_mute(self):
        for name, screen in (("home", "sTitle"), ("result", "sResult")):
            seq = self.seq(name)
            before = seq[2 if name == "home" else 1][1]   # ⌂ ／ 結果へ 進んだ ところ
            self.assertEqual(before["screen"], screen, name)
            self.assertTrue(before["ks"]["bgm"], name)  # うしろの ふしが 鳴って いる
            self.assertIsNotNone(before["tgl"], name + ": 音の ボタンが 見えない")
            self.assertTrue(before["tgl"]["inView"], name)
            tap = [v for k, v in seq if k == "tapTgl"][0]
            self.assertFalse(tap["ks"]["on"], name)
            self.assertFalse(tap["ks"]["bgm"], name)
            self.assertEqual(tap["store"], "0", name)
            self.assertEqual(seq[-1][1]["fa"]["osc"], tap["fa"]["osc"], name + ": 切った あとも 音を 作った")

    def test_title_and_result_switch_clear_on_five_screens(self):
        for w, h in VPS5:
            for k in ("t", "r"):
                name = "%s%dx%d" % (k, w, h)
                seq = self.seq(name)
                o = self.r[name]["olap"][0]
                self.assertNotIn("none", o, name)
                self.assertEqual(o["o"], {}, name + " %r" % (o,))
                self.assertTrue(o["top"], name + ": ボタンの 上に ほかの ものが ある")
                self.assertGreaterEqual(o["box"][2], 44, name)
                self.assertGreaterEqual(o["box"][3], 44, name)
                self.assertFalse(o["hscroll"], name)

    def test_pause_during_pending_resume_stays_quiet(self):
        seq = self.seq("slowPause")
        after = seq[2][1]   # 解く → すぐ 止める → 2.5秒
        self.assertEqual(after["ctxState"], "suspended")
        self.assertFalse(after["ks"]["bgm"])
        back = seq[-1][1]   # 前面に もどったら つづく
        self.assertEqual(back["ctxState"], "running")
        self.assertTrue(back["ks"]["bgm"])

    def test_scheduled_card_sounds_are_cancelled(self):
        for name in ("cancelHome", "cancelNext", "cancelResult"):
            x = self.r[name]
            self.assertEqual(x["errs"], [], name)
            self.assertGreater(x["js"][-2], 0, name + ": 予約が できて いない")   # 取り消す 前は 予約が ある
            self.assertEqual(x["js"][-1], 0, name + ": 前の カードの 音が まだ 鳴る 予定")
        self.assertEqual(self.r["cancelHome"]["steps"][-1][1]["screen"], "sTitle")
        self.assertEqual(self.r["cancelResult"]["steps"][-1][1]["screen"], "sResult")


if __name__ == "__main__":
    unittest.main()
