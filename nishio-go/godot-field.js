// にしおさんぽGO：歩く地図（操作して移動・あるいて移動のドット絵の地図）を Godot で描く（試作。せってい の「Godotで地図を描く」）
// ・ゲームのしくみ（歩く・チェックイン・たからばこ・人の話・スティック）はいままでどおり pixel.js / game.js。絵もいままでの canvas の絵
// ・pixel.js の frame() は、描く命令を canvas の代わりにこの記録係（rec）に書く。記録係はそれを数の並び（Float32Array）にして、
//   Godot（godot/field。書き出したものは nishio-go/godot/）が window.nsgField.frame() で受けとって描く。絵は nsgField.png(id) で PNG を渡す
// ・Godot だけでしていること：雨と雪のつぶ、時間帯の色あい（nsgField.env()）
// ・Godot の画面は地図の canvas の上にかさね、タップは下の canvas に通す（名所やお店の札のタップはいままでどおり）
// ・Godot は約7.6MB（圧縮して）あるので、オンにしたときだけ読みこむ。WebGL2 が使えない端末では使えない
// ・オフにしたら Godot を終わらせる（見えないまま動きつづけて電池を使わないように）。またオンにしたら起動しなおす
// ・せかいちず・ふつうの地図のあいだは Godot を休ませる（nsgField.awake() が false。Godot は1秒に2回だけ動き、雨と雪のつぶも止める）
//   Emscripten の pauseMainLoop は使わない（止めると Godot がそのまま終了してしまう）
(() => {
  'use strict';
  const KEY = 'nsg_godot', P = window.nishioPixel, G = window.nishioGo;
  if (!P || !G) return;
  const $ = id => document.getElementById(id);
  let want = (() => { try { return localStorage.getItem(KEY) === '1' || /[?&]godot=1\b/.test(location.search); } catch (e) { return false; } })();
  let ready = false, starting = false, canvas = null, engine = null, sleeping = false, latest = '', sent = '';

  /* ---------- 描く命令の記録係（CanvasRenderingContext2D のうち、pixel.js の frame が使うものだけ） ---------- */
  const scratch = document.createElement('canvas').getContext('2d');   // 文字の幅をはかる
  const ids = new WeakMap(), byId = [];
  const idOf = img => { let id = ids.get(img); if (id === undefined) { id = byId.length; byId.push(img); ids.set(img, id); } return id; };
  const textCache = new Map();
  const colorCache = new Map();
  function parseColor(c) {   // → [0xRRGGBB, 不透明度]
    if (colorCache.has(c)) return colorCache.get(c);
    let v = [0, 1];
    if (typeof c === 'string') {
      if (c[0] === '#') {
        const h = c.length === 4 ? c.slice(1).split('').map(x => x + x).join('') : c.slice(1, 7);
        v = [parseInt(h, 16), 1];
      } else {
        const m = c.match(/rgba?\(([^)]+)\)/);
        if (m) { const p = m[1].split(',').map(Number); v = [(p[0] << 16) | (p[1] << 8) | p[2], p.length > 3 ? p[3] : 1]; }
      }
    }
    colorCache.set(c, v);
    return v;
  }
  const rec = {
    fillStyle: '#000', strokeStyle: '#000', lineWidth: 1, globalAlpha: 1, font: '10px sans-serif', textAlign: 'start', textBaseline: 'alphabetic', imageSmoothingEnabled: false,
    out: [], m: [1, 0, 0, 1, 0, 0], stack: [], path: [],
    begin() { this.out.length = 0; this.m = [1, 0, 0, 1, 0, 0]; this.stack.length = 0; this.globalAlpha = 1; },
    end() {
      const f = new Float32Array(this.out), u = new Uint8Array(f.buffer);
      let s = '';
      for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
      latest = btoa(s);
    },
    pt(x, y) { const m = this.m; return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]; },
    save() { this.stack.push({ m: this.m.slice(), fillStyle: this.fillStyle, strokeStyle: this.strokeStyle, globalAlpha: this.globalAlpha, font: this.font, textAlign: this.textAlign, textBaseline: this.textBaseline, lineWidth: this.lineWidth }); },
    restore() { const s = this.stack.pop(); if (s) Object.assign(this, s); },
    translate(x, y) { const m = this.m; m[4] += m[0] * x + m[2] * y; m[5] += m[1] * x + m[3] * y; },
    rotate(a) { const m = this.m, c = Math.cos(a), s = Math.sin(a); this.m = [m[0] * c + m[2] * s, m[1] * c + m[3] * s, m[2] * c - m[0] * s, m[3] * c - m[1] * s, m[4], m[5]]; },
    drawImage(img, a, b, c, d) {
      if (!img) return;
      const w = c === undefined ? img.width : c, h = d === undefined ? img.height : d, [x, y] = this.pt(a, b);
      this.out.push(1, idOf(img), x, y, w, h, this.globalAlpha);
    },
    fillRect(x, y, w, h) {
      const [c, al] = parseColor(this.fillStyle), [px, py] = this.pt(x, y);
      this.out.push(2, px, py, w, h, c, al * this.globalAlpha);
    },
    beginPath() { this.path = []; },
    moveTo(x, y) { this.path.push(this.pt(x, y)); },
    lineTo(x, y) { this.path.push(this.pt(x, y)); },
    closePath() {},
    fill() {
      const p = this.path, [c, al] = parseColor(this.fillStyle);
      if (p.length < 3) return;
      this.out.push(3, p.length); for (const [x, y] of p) this.out.push(x, y); this.out.push(c, al * this.globalAlpha);
    },
    measureText(t) { scratch.font = this.font; return scratch.measureText(t); },
    // 文字は、その文字だけの小さな canvas に描いて、絵として渡す（Godot に日本語のフォントを入れなくてよいように）
    text(t, x, y, stroke) {
      const key = `${stroke ? 'S' : 'F'}|${this.font}|${stroke ? this.strokeStyle + '|' + this.lineWidth : this.fillStyle}|${t}`;
      let e = textCache.get(key);
      if (!e) {
        scratch.font = this.font;
        const fs = parseFloat((this.font.match(/(\d+(?:\.\d+)?)px/) || [0, 10])[1]), pad = Math.ceil((stroke ? this.lineWidth : 0) + 2);
        const w = Math.ceil(scratch.measureText(t).width) + pad * 2, h = Math.ceil(fs * 1.4) + pad * 2, c = document.createElement('canvas');
        c.width = Math.max(1, w); c.height = Math.max(1, h);
        const x2 = c.getContext('2d'); x2.font = this.font; x2.textBaseline = 'middle'; x2.textAlign = 'left';
        if (stroke) { x2.strokeStyle = this.strokeStyle; x2.lineWidth = this.lineWidth; x2.lineJoin = 'round'; x2.strokeText(t, pad, h / 2); }
        else { x2.fillStyle = this.fillStyle; x2.fillText(t, pad, h / 2); }
        e = { c, w, h, pad, fs };
        textCache.set(key, e);
      }
      const tw = e.w - e.pad * 2, dx = this.textAlign === 'center' ? -tw / 2 : this.textAlign === 'right' || this.textAlign === 'end' ? -tw : 0;
      const dy = this.textBaseline === 'middle' ? 0 : this.textBaseline === 'bottom' || this.textBaseline === 'alphabetic' ? -e.fs * 0.55 : e.fs * 0.55;
      const [px, py] = this.pt(x + dx - e.pad, y + dy - e.h / 2);
      this.out.push(1, idOf(e.c), px, py, e.w, e.h, this.globalAlpha);
    },
    fillText(t, x, y) { this.text(String(t), x, y, false); },
    strokeText(t, x, y) { this.text(String(t), x, y, true); },
    strokeRect() {}, clearRect() {}, stroke() {}, arc() {},
  };

  /* ---------- Godot から呼ばれる窓口 ---------- */
  const jstHour = () => new Date(Date.now() + 9 * 3600e3).getUTCHours();
  window.nsgField = {
    frame() { if (latest === sent) return ''; sent = latest; return latest; },
    png(id) { const c = byId[id]; if (!c) return ''; try { return c.toDataURL('image/png').split(',')[1]; } catch (e) { return ''; } },
    awake() { return !sleeping; },
    env() { const w = window.NISHIO_WEATHER && window.NISHIO_WEATHER.current; return JSON.stringify({ kind: (w && w.kind) || '', hour: jstHour() }); },
  };

  /* ---------- pixel.js から見える口 ---------- */
  window.NSG_GODOT = {
    rec,
    on() { if (want && !ready && !starting) start(); if (want && ready) sleeping = false; syncSize(); return want && ready; },   // Godot が動いているときだけ記録係で描く
    idle() { if (canvas) canvas.style.visibility = 'hidden'; sleeping = true; },
  };

  function syncSize() {
    if (!canvas) return;
    const cv = $('pxCanvas');
    canvas.style.visibility = want && ready ? 'visible' : 'hidden';
    if (canvas.width !== cv.width || canvas.height !== cv.height) { canvas.width = cv.width; canvas.height = cv.height; }
  }

  function start() {
    starting = true;
    if (window.Engine) return launch();   // 2回目からは読みこみずみ
    const s = document.createElement('script');
    s.src = 'nishio-go/godot/field.js';
    s.onerror = () => fail('Godot を読みこめませんでした');
    s.onload = launch;
    document.head.appendChild(s);
  }
  function launch() {
    const E = window.Engine;
    if (!E) return fail('Godot を読みこめませんでした');
    const missing = E.getMissingFeatures ? E.getMissingFeatures({ threads: false }) : [];
    if (missing.length) return fail('この端末では Godot の地図を使えません（' + missing.join('・') + '）');
    canvas = document.createElement('canvas');
    canvas.id = 'godotCanvas';
    canvas.setAttribute('aria-hidden', 'true');
    canvas.style.visibility = 'hidden';
    $('pxCanvas').after(canvas);
    syncSize();
    const e = engine = new E({ executable: 'nishio-go/godot/field', canvas, canvasResizePolicy: 0, focusCanvas: false, args: [] });
    e.startGame().then(() => {
      if (e !== engine) return;
      starting = false;
      if (!want) return stop();   // 起動中にオフにされた
      ready = true; syncSize();
    }, err => { if (e === engine) fail('Godot を起動できませんでした' + (err && err.message ? '（' + err.message + '）' : '')); });
  }
  // Godot を終わらせる（オフにしたとき）。canvas も外す（つぎは新しい canvas で起動する）
  function stop() {
    if (starting) return;   // 起動が終わってから止める（launch の then）
    ready = false; sleeping = false;
    if (engine) { try { engine.requestQuit(); } catch (e) { /* noop */ } engine = null; }
    if (canvas) { canvas.remove(); canvas = null; }
  }
  function fail(msg) {
    starting = false; want = false; ready = false; engine = null;
    try { localStorage.setItem(KEY, '0'); } catch (e) { /* noop */ }
    if (canvas) canvas.style.visibility = 'hidden';
    const t = $('godotToggle'); if (t) t.checked = false;
    if (G.toast) G.toast('🎮 ' + msg + '。いつもの地図で描きます');
  }

  /* ---------- せってい ---------- */
  const t = $('godotToggle');
  if (t) {
    t.checked = want;
    t.addEventListener('change', () => {
      want = t.checked;
      try { localStorage.setItem(KEY, want ? '1' : '0'); } catch (e) { /* noop */ }
      if (!want) stop();
      if (G.toast) G.toast(want ? '🎮 Godot で地図を描きます（はじめは読みこみに少し時間がかかります）' : '🎮 いつもの地図で描きます');
    });
  }
})();
