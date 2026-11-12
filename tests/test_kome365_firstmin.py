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


# 周回170: 芽の 列(richDraw)を index.html から 取り出し、にせの 画面で ○ を 1つずつ 足して、列に 残る 物(子の 並び・点)を 記録する
RICH_JS = r"""
const fs = require('fs');
const html = fs.readFileSync(process.argv[1], 'utf8');
const a = html.indexOf('  var RICH_TH = '), b = html.indexOf('  /* 小さな再会(周回125', a);
if (a < 0 || b < 0) { console.log(JSON.stringify({ error: 'no code' })); process.exit(0); }
function mk(tag){ const el = { tagName: tag, className: '', children: [], attrs: {}, style: {},
  appendChild(c){ this.children.push(c); return c; }, setAttribute(k, v){ this.attrs[k] = String(v); }, getAttribute(k){ return k in this.attrs ? this.attrs[k] : null; },
  classList: { add(){ for (const x of arguments) el._cl.add(x); }, remove(){ for (const x of arguments) el._cl.delete(x); }, toggle(x, v){ if (v) el._cl.add(x); else el._cl.delete(x); }, contains(x){ return el._cl.has(x); } }, _cl: new Set() };
  Object.defineProperty(el, 'innerHTML', { set(){ el.children = []; }, get(){ return ''; } }); return el; }
const row = mk('div'); const $ = id => id === 'swRich' ? row : null;
const document = { createElement: mk };
const traceInfo = { okN: 0, count: 0 }; let branchInfo = { key: '', hint: '' };
function pixRichSet(e, k){ e.setAttribute('data-pixrich', k); } function pixStatSet(){}
eval(html.slice(a, b));
function sig(e){ return e.className.replace(/\b(new|pop)\b/g, '').trim() + '[' + (e.getAttribute('data-pixrich') || '') + ']' + e.children.map(sig).join(''); }
(async () => {
const out = [];
for (let ok = 0; ok <= +process.argv[2]; ok++) { traceInfo.okN = ok; traceInfo.count = ok; richDraw(ok > 0);   // 1手に ○ 1つ
  const m = row.children.find(c => /nxMound/.test(c.className));
  const dots = m ? m.children[0].children : [];
  out.push({ ok: ok, on: row._cl.has('on'), sig: row.children.map(sig).join('|'), plants: row.children.filter(c => !/nxMound/.test(c.className)).length,
    got: m ? +m.getAttribute('data-got') : null, need: m ? +m.getAttribute('data-need') : null, lit: dots.filter(d => /\bon\b/.test(d.className)).length, dots: dots.length, pop: dots.filter(d => /\bpop\b/.test(d.className)).length });
  const pops = () => { const m2 = row.children.find(c => /nxMound/.test(c.className)); return m2 ? m2.children[0].children.filter(d => /\bpop\b/.test(d.className)).length : 0; };
  richDraw(false); out[out.length - 1].popSame = pops();   // 同じ 手の 描きなおし(気配・色が 変わった 手): ふくらみを 引きつぐ(Codex 指摘)
  await new Promise(r => setTimeout(r, 0));
  richDraw(false); out[out.length - 1].popAgain = pops();   // 手が 終わった あとの 描きなおし: 古い 点は ふくらまない
}
console.log(JSON.stringify(out));
})();
"""


def rich_run(n):
    node = shutil.which("node")
    if not node:
        raise unittest.SkipTest("node がないので実行の確認は飛ばす")
    out = subprocess.run([node, "-e", RICH_JS, HTML_PATH, str(n)], capture_output=True, text=True)
    if out.returncode != 0:
        raise AssertionError(out.stderr[-2000:])
    return json.loads(out.stdout.strip().splitlines()[-1])


# 周回170(Codex 指摘): 世話の あと〜芽の 列(traceAdd・branchAdd・richDraw)を まとめて 取り出し、ゲームと 同じ 順(traceAdd(true) → branchAdd(card.key))で 流す。
# 1手ごとに、点が いくつ ふくらんで いるか(pop)・光った 点の 数を 返す。'tick' は その 手の あと(ゲームの 流れが 終わった あと)
FLOW_JS = r"""
const fs = require('fs');
const html = fs.readFileSync(process.argv[1], 'utf8');
const a = html.indexOf('  var traceInfo = { list: [], okN: 0'), b = html.indexOf('  /* 小さな再会(周回125', a);
if (a < 0 || b < 0) { console.log(JSON.stringify({ error: 'no code' })); process.exit(0); }
function mk(tag){ const el = { tagName: tag, className: '', children: [], attrs: {}, style: {},
  appendChild(c){ this.children.push(c); return c; }, setAttribute(k, v){ this.attrs[k] = String(v); }, getAttribute(k){ return k in this.attrs ? this.attrs[k] : null; }, removeAttribute(k){ delete this.attrs[k]; },
  classList: { add(){ for (const x of arguments) el._cl.add(x); }, remove(){ for (const x of arguments) el._cl.delete(x); }, toggle(x, v){ if (v) el._cl.add(x); else el._cl.delete(x); }, contains(x){ return el._cl.has(x); } }, _cl: new Set() };
  Object.defineProperty(el, 'innerHTML', { set(){ el.children = []; }, get(){ return ''; } }); return el; }
const row = mk('div'); const $ = id => id === 'swRich' ? row : null;
const document = { createElement: mk };
var delayList = [], choices = '';
function pixStatSet(){}
eval(html.slice(a, b));
function state(){ const m = row.children.find(c => /nxMound/.test(c.className)); const d = m ? m.children[0].children : [];
  return { pop: d.filter(x => /\bpop\b/.test(x.className)).length, lit: d.filter(x => /\bon\b/.test(x.className)).length, popIdx: d.findIndex(x => /\bpop\b/.test(x.className)), branch: row.children.some(c => /\bbranch\b/.test(c.className)), hint: row.children.some(c => /\bhint\b/.test(c.className)) }; }
(async () => {
  const out = [];
  for (const st of JSON.parse(process.argv[2])) {
    if (st[0] === 'ok') { traceAdd(true); if (st[1]) branchAdd(st[1]); }   // 判定 ○(index.html の choose と 同じ 順)
    else if (st[0] === 'ng') traceAdd(false);
    else if (st[0] === 'tick') await new Promise(r => setTimeout(r, 0));
    else if (st[0] === 'redraw') richDraw(false);
    else if (st[0] === 'replay') { traceClear(); for (const x of st[1]) traceReplay(x[0] ? '⭕' : '❌', x[1]); }
    out.push(Object.assign({ step: st[0] }, state()));
  }
  console.log(JSON.stringify(out));
})();
"""


def flow_run(steps):
    node = shutil.which("node")
    if not node:
        raise unittest.SkipTest("node がないので実行の確認は飛ばす")
    out = subprocess.run([node, "-e", FLOW_JS, HTML_PATH, json.dumps(steps)], capture_output=True, text=True)
    if out.returncode != 0:
        raise AssertionError(out.stderr[-2000:])
    return json.loads(out.stdout.strip().splitlines()[-1])


# 周回170(Codex 指摘): 本物の ブラウザ(Playwright の Chromium)で 小山と 点が 見えるかを はかる。サーバーは 立てず、ページの 読みこみを ディスクから 返す
BROWSER_JS = r"""
const fs = require('fs'), path = require('path');
let chromium; try { ({ chromium } = require('playwright')); } catch (e) { console.log(JSON.stringify({ skip: 'playwright なし' })); process.exit(0); }
const [htmlPath, root] = process.argv.slice(1, 3);
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.css': 'text/css', '.ico': 'image/x-icon' };
(async () => {
  let b; try { b = await chromium.launch(); } catch (e) { console.log(JSON.stringify({ skip: 'chromium が 起動しない' })); return; }
  const out = [];
  for (const [w, h, rm] of JSON.parse(process.argv[3])) {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true, reducedMotion: rm ? 'reduce' : 'no-preference' });
    const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.route('http://kome.test/**', r => { const u = new URL(r.request().url()); let f = u.pathname === '/kome365/index.html' ? htmlPath : path.join(root, decodeURIComponent(u.pathname));
      if (!f.startsWith(root) && f !== htmlPath || !fs.existsSync(f) || fs.statSync(f).isDirectory()) return r.fulfill({ status: 404, body: '' });
      r.fulfill({ status: 200, contentType: TYPES[path.extname(f)] || 'application/octet-stream', body: fs.readFileSync(f) }); });
    await p.goto('http://kome.test/kome365/index.html?no3d');
    await p.waitForFunction(() => window.__komeReady, null, { timeout: 60000 });
    // ○ で 点が 1つ 光るまで(芽に かわった 手は 点が 0 なので もう 1枚)カードを 決める。○ に ならなければ 次は 反対へ
    let key = 'ArrowLeft', res = null;
    for (let i = 0; i < 16 && !res; i++) {
      const before = await p.evaluate(() => ({ ok: window.__swipe.richState().okN, d: document.getElementById('swBigDate').innerText }));
      await p.keyboard.press(key);
      await p.waitForFunction(d => document.getElementById('swBigDate').innerText !== d, before.d, { timeout: 8000 }).catch(() => {});
      res = await p.evaluate((ok0) => {
        const st = window.__swipe.richState(); if (st.okN === ok0) return null;
        const m = document.querySelector('#swRich .nxMound'); if (!m) return { noMound: true, okN: st.okN };
        const dots = [...m.querySelectorAll('.nxDots i')], lit = dots.filter(d => d.classList.contains('on'));
        if (!lit.length) return null;
        const vis = e => { for (let n = e; n && n.nodeType === 1; n = n.parentElement) { const cs = getComputedStyle(n); if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity < 0.3) return false; } return true; };
        const box = e => { const r = e.getBoundingClientRect(); return [r.left, r.top, r.width, r.height]; };
        const inView = b => b[2] > 0 && b[3] > 0 && b[0] >= 0 && b[1] >= 0 && b[0] + b[2] <= innerWidth && b[1] + b[3] <= innerHeight;
        const pop = m.querySelector('.nxDots i.pop');
        return { mound: box(m), moundVis: vis(m), moundIn: inView(box(m)), need: +m.getAttribute('data-need'), got: +m.getAttribute('data-got'), dots: dots.length, lit: lit.length,
          dotsOk: dots.every(d => vis(d) && inView(box(d))), dotW: dots[0].offsetWidth, litBg: getComputedStyle(lit[0]).backgroundColor, offBg: dots.length > lit.length ? getComputedStyle(dots[dots.length - 1]).backgroundColor : '',
          popAnim: pop ? getComputedStyle(pop).animationName : null, popDur: pop ? getComputedStyle(pop).animationDuration : null };
      }, before.ok);
      if (res === null) { const ok1 = await p.evaluate(() => window.__swipe.richState().okN); if (ok1 === before.ok) key = key === 'ArrowLeft' ? 'ArrowRight' : 'ArrowLeft'; await p.waitForTimeout(400); }
    }
    out.push(Object.assign({ w, h, rm: !!rm, errs: errs.length }, res || { none: true }));
    await ctx.close();
  }
  await b.close(); console.log(JSON.stringify(out));
})();
"""


def css_rule(selector):
    m = re.search(r"^" + re.escape(selector) + r"\{([^}]*)\}", HTML, re.M)
    return m.group(1) if m else ""


class TestKome365FirstMinute(unittest.TestCase):
    def test_rich_and_delay_live_inside_card_wrap(self):
        # 蓄積の植物と金の花は、カードの包み(#swWrap)の中で「世話のあと」の次に置く
        wrap = HTML[HTML.index('<div id="swWrap">'):HTML.index('<div id="swCard"')]
        self.assertIn('<div id="swTrace" aria-hidden="true"></div><div id="swRich" aria-hidden="true"></div><div id="swDelay" aria-hidden="true"></div>', wrap)
        self.assertEqual(HTML.count('id="swRich"'), 1)
        self.assertEqual(HTML.count('id="swDelay"'), 1)

    def test_rich_and_delay_are_anchored_above_card(self):
        # 画面の高さの割合(top:47%・54%)ではなく、カードの上端から数える
        rich, delay = css_rule("#swRich"), css_rule("#swDelay")
        self.assertIn("bottom:calc(100% + 48px)", rich)
        self.assertIn("bottom:calc(100% + 82px)", delay)
        self.assertNotRegex(rich, r"(^|;)top:")
        self.assertNotRegex(delay, r"(^|;)top:")
        self.assertIn("#swRich:not(.on) + #swDelay{bottom:calc(100% + 48px)}", HTML)

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
        self.assertIn("@media (max-height:790px){#swTrace .tr{width:30px;height:30px;background-size:30px 30px}#swRich{bottom:calc(100% + 38px)}#swDelay{bottom:calc(100% + 72px)}#swRich:not(.on) + #swDelay{bottom:calc(100% + 38px)}}", HTML)
        self.assertIn("@media (min-height:701px) and (max-height:790px) and (min-width:301px) and (max-width:410px){#swSeasonScene{width:72px;height:72px}", HTML)

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
        self.assertIn("@media (max-height:440px) and (min-width:564px){#swMood{left:calc(10px - (100vw - 480px) / 2)}#swGrow{left:calc(8px - (100vw - 480px) / 2)}#swKakashi{right:calc(10px - (100vw - 480px) / 2)}#swSkyWx{right:calc(8px - (100vw - 480px) / 2)}#swAheadWx{right:calc(14px - (100vw - 480px) / 2)}}", HTML)
        self.assertNotIn("(min-width:660px)", HTML)
        # 564px = カードの 幅 360px + 左右に 顔の 幅 92px と 空き 10px ずつ
        self.assertEqual(360 + 2 * (92 + 10), 564)
        self.assertIn("width:92px", css_rule("#swMood"))
        # 横向きでは 開いて すぐの 挨拶の 顔を、カードの 日付に かからない 高さへ(縦向きの 34% は そのまま)
        self.assertIn("@media (max-height:440px){#swGreet{top:min(34%, calc(100% - 246px))}}", HTML)
        self.assertIn("top:34%", css_rule("#swGreet"))

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
        # 周回168: 320×568 で カードの 上の 端が 238〜262px まで 上がり、季節の 景色・今日の 天気・あしたの 空が 日付に かぶって いた(24枚中 22・12・5枚)
        rule = "@media (min-height:441px) and (max-height:600px) and (min-width:301px) and (max-width:480px){#swSeasonScene{display:none!important}#swSkyWx{top:172px;width:60px;height:60px}#swSkyWx .wxIc{width:42px;height:42px}#swAheadWx{top:84px;right:100px;width:44px;height:44px;font-size:28px}#swAheadWx .ahIc{width:30px;height:30px}#swAheadWx .ahBadge{right:-6px;top:-6px;width:18px;height:18px;background-size:14px 14px}}"
        self.assertIn(rule, HTML)
        body = rule[rule.index("{") + 1:]
        # あしたの 空は 遊びの 知らせなので 消さない(置き場所と 大きさだけ。消す・動かす は 運営者の 見た目の 決めごと・周回167)。消すのは 飾りの 景色だけ
        self.assertNotIn("#swAheadWx{display:none", body)
        self.assertNotIn("#swAheadWx,", body)
        self.assertIn("#swSeasonScene{display:none!important}", body)
        # 今日の 天気の 下の 端(172 + 60 = 232px)は カードの いちばん 上(238px)より 上・かかし(下の 端 169px)より 下
        self.assertLessEqual(172 + 60, 238)
        self.assertGreaterEqual(172, 169)
        # あしたの 空(320px 幅で 左 160〜右 204px・上 84〜下 128px。小さな 日の出の しるしは 6px はみ出す)は かかし(左の 端 210px)の 左・顔(右の 端 123px)の 右・カードより ずっと 上
        swipe_right = 320 - 16
        left, right = swipe_right - 100 - 44, swipe_right - 100
        self.assertLessEqual(right + 6, 210)
        self.assertGreaterEqual(left, 123)
        self.assertLess(84 + 44, 238)
        # 横向き(440px 以下)・390×844 などの 大きい 画面の 置き方は 変えない
        self.assertIn("#swSkyWx{position:absolute;right:8px;top:196px;", HTML)
        self.assertIn("#swAheadWx{position:absolute;right:14px;top:272px;", HTML)
        self.assertIn("@media (max-height:440px) and (min-width:564px){#swMood{left:calc(10px - (100vw - 480px) / 2)}", HTML)


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


    def test_next_sprout_dots_change_every_ok(self):
        # 周回170: ○ が 2・4・7・11・16…(RICH_TH)で 芽が ふえるので、○ を 重ねても 列が 変わるのは 間かくの おわり だけ(11〜20枚目で 10枚中 1〜2枚)。
        # 列の おわりに「次の 芽まで ○ が あと いくつ」の 点を 出し、○ の たびに 点が 1つ 光る
        r = rich_run(40)
        self.assertNotIn("error", r)
        changed = [r[i]["ok"] for i in range(1, 38) if r[i]["sig"] != r[i - 1]["sig"]]
        self.assertEqual(changed, list(range(1, 38)), "○ を 重ねても 列に 残る 物が 変わらない ○ が ある")
        # ○ 0こ: 何も 出さない。○ 1こ目から 出す
        self.assertEqual(r[0]["got"], None)
        self.assertFalse(r[0]["on"])
        self.assertTrue(r[1]["on"])
        th = [2, 4, 7, 11, 16, 22, 29, 37]
        for x in r[1:37]:
            lv = sum(1 for t in th if x["ok"] >= t)
            prev = th[lv - 1] if lv else 0
            self.assertEqual(x["plants"], lv, x)
            self.assertEqual((x["need"], x["got"], x["dots"], x["lit"]), (th[lv] - prev, x["ok"] - prev, th[lv] - prev, x["ok"] - prev), x)
            self.assertLess(x["lit"], x["dots"])   # ぜんぶ 光った ○ で 芽に かわる(光りきった 点は 残らない)
            self.assertEqual(x["pop"], 1 if x["lit"] else 0, x)   # その ○ で 光った 点だけ ふくらむ
            self.assertEqual(x["popSame"], x["pop"], x)   # 同じ 手の 描きなおしでは ふくらみを 引きつぐ(Codex 指摘)
            self.assertEqual(x["popAgain"], 0, x)   # 手が 終わった あとの 描きなおしでは ふくらまない
        self.assertLessEqual(max(x["dots"] for x in r if x["dots"]), 8)   # 2つずつ 4段に おさまる
        # 芽が 8つ そろったら 出さない
        self.assertEqual([x["got"] for x in r[37:]], [None] * len(r[37:]))
        self.assertEqual(r[40]["plants"], 8)

    def test_next_sprout_dots_fit_and_calm(self):
        # 小山は 列の 外(右どなり)に 置き、植物の ならびは 前と 同じ。せまい 画面(320〜360px)では 列の 左上の 空きへ。字・数字は 出さない
        # 広い 画面(361px 以上): 小山 22px・点 6px(3つずつ 3段)。まだの 点は 砂色、光った 点は 芽の 緑
        self.assertIn("#swRich .rc.nxMound{position:absolute;left:100%;bottom:0;margin-left:4px;width:22px;height:32px;filter:none}", HTML)
        self.assertIn("#swRich .rc.nxMound .nxDots{position:absolute;left:0;width:22px;bottom:9px;", HTML)
        self.assertIn("#swRich .rc.nxMound .nxDots i{display:block;width:6px;height:6px;border-radius:50%;background:#e2d2ad;", HTML)
        self.assertIn("#swRich .rc.nxMound .nxDots i.on{background:#5cc23a;", HTML)
        self.assertEqual((22 + 2) // (6 + 2), 3)   # 3つずつ 並ぶ → 8つでも 3段(6×3 + 2×2 = 22px)に おさまる
        # せまい 画面(360px 以下): 列の 左上・小山 14px・点 4px(2つずつ 4段)。広い 画面の きまりより あとに 置く(あとの きまりが 勝つ)
        narrow = "@media (max-width:360px){#swRich .rc.nxMound{left:calc(50% - 32px);bottom:100%;margin-left:0;width:14px;height:30px}#swRich .rc.nxMound::before{height:6px}#swRich .rc.nxMound .nxDots{left:2px;width:10px;bottom:8px}#swRich .rc.nxMound .nxDots i{width:4px;height:4px}}"
        self.assertIn(narrow, HTML)
        self.assertGreater(HTML.index(narrow), HTML.index("#swRich .rc.nxMound .nxDots i.pop{"))
        self.assertEqual((10 + 2) // (4 + 2), 2)
        # ふくらむ 動きは 0.3秒
        self.assertIn("#swRich .rc.nxMound .nxDots i.pop{animation:swNextPop .3s ease-out 1 both}", HTML)
        self.assertIn("#swRich.on{min-height:30px}", HTML)
        # 動きを減らす 設定では 点は ふくらまない(点の 数は 同じ)
        self.assertIn("@media (prefers-reduced-motion: reduce){#swRich .rc.new,#swRich .rc.nxMound .nxDots i.pop{animation:none}}", HTML)
        code = HTML[HTML.index("  function richNext(e, lv, isNew){"):HTML.index("  /* 小さな再会(周回125")]
        self.assertNotIn("textContent", code)
        self.assertNotIn("innerText", code)
        # 確かめ用の 数え(richState)は 植物だけ(小山は 数えない)
        self.assertIn("rcs = e ? [].map.call(e.querySelectorAll('.rc:not(.nxMound)')", HTML)


    def test_ok_dot_pops_once_even_when_flower_redraws(self):
        # Codex 指摘(周回170): ○ で 世話の 花の 気配(hint)や 色の 確定(branch)が 変わると、branchAdd が 同じ 流れで richDraw を もう一度 呼び、
        # その ○ で 光った 点の ふくらみ(pop)が 消えて いた(traceAdd(true) → branchAdd('basal') で pop 1 → 0)
        r = flow_run([["ok", "basal"], ["tick"], ["ok", "basal"], ["tick"], ["ok", "flood"], ["tick"]])
        self.assertNotIn("error", r)
        self.assertTrue(r[0]["hint"])              # 1つめの basal で 気配が 出る(2回目の 描きなおし)
        self.assertEqual(r[0]["pop"], 1, r[0])     # それでも その ○ の 点は ふくらむ
        self.assertEqual(r[0]["popIdx"], r[0]["lit"] - 1)
        self.assertTrue(r[2]["branch"])            # 2つめで 色が 決まる(もう一度 描きなおし)
        self.assertEqual(r[2]["pop"], 1 if r[2]["lit"] else 0, r[2])
        self.assertEqual(r[4]["pop"], 1 if r[4]["lit"] else 0, r[4])   # 描きなおしの ない ○ も 同じ
        # ○ で ない 描きなおし(その 手が 終わった あと)では 古い 点は ふくらまない
        r = flow_run([["ok", "basal"], ["tick"], ["redraw"], ["ng"], ["tick"], ["redraw"]])
        self.assertEqual([x["pop"] for x in r], [1, 1, 0, 0, 0, 0])
        # 保存から もどる(選んだ 列の 再生)では どの 点も ふくらまない。その あとの ○ は ふくらむ
        r = flow_run([["replay", [[1, "basal"], [0, ""], [1, "flood"]]], ["tick"], ["redraw"], ["ok", "flood"]])
        self.assertEqual([x["pop"] for x in r], [0, 0, 0, 1])
        self.assertEqual(r[0]["lit"], 0)   # ○ 2つ = 芽 1つ・次の 点は まだ 0
        self.assertEqual(r[3]["lit"], 1)


    def test_next_sprout_dots_visible_in_browser(self):
        # Codex 指摘(周回170): CSS の 文字を 見る だけでは、点を 消す 1行(display:none)を 足しても 通って いた。本物の ブラウザで 四角・見え方・動きを はかる
        node = shutil.which("node")
        if not node:
            raise unittest.SkipTest("node がないので実行の確認は飛ばす")
        vps = [[320, 568, False], [390, 844, False], [844, 390, False], [390, 844, True], [320, 568, True]]
        out = subprocess.run([node, "-e", BROWSER_JS, HTML_PATH, ROOT, json.dumps(vps)], capture_output=True, text=True, timeout=600)
        if out.returncode != 0:
            raise AssertionError(out.stderr[-2000:])
        r = json.loads(out.stdout.strip().splitlines()[-1])
        if isinstance(r, dict) and r.get("skip"):
            raise unittest.SkipTest(r["skip"])
        for x in r:
            name = "%dx%d%s" % (x["w"], x["h"], " reduce" if x["rm"] else "")
            self.assertNotIn("none", x, name + ": ○ で 点が 光らなかった")
            self.assertNotIn("noMound", x, name + ": 小山が 無い")
            self.assertEqual(x["errs"], 0, name)
            self.assertTrue(x["moundVis"] and x["moundIn"], name + ": 小山が 見えない・画面の 外 %r" % (x,))
            self.assertGreater(x["mound"][2], 0, name)
            self.assertGreater(x["mound"][3], 0, name)
            self.assertTrue(x["dotsOk"], name + ": 点が 見えない・画面の 外")
            self.assertEqual(x["dots"], x["need"], name)   # 点の 数 = 次の 芽までに いる ○(動きを減らす 設定でも 同じ)
            self.assertEqual(x["lit"], x["got"], name)
            self.assertGreaterEqual(x["lit"], 1, name)
            self.assertEqual(x["dotW"], 4 if x["w"] <= 360 else 6, name)
            if x["offBg"]:
                self.assertNotEqual(x["litBg"], x["offBg"], name)   # 光った 点と まだの 点は 色が ちがう
            if x["rm"]:
                self.assertEqual(x["popAnim"], "none", name)   # 動きを減らす 設定では ふくらまない
            else:
                self.assertEqual((x["popAnim"], x["popDur"]), ("swNextPop", "0.3s"), name)


if __name__ == "__main__":
    unittest.main()
