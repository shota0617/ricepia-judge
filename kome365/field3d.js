/* 米づくり365 3Dの田んぼ(three.js r128)
 * Field3D.init(canvas) → true/false(WebGLが使えなければ false。呼び出し側は2Dの絵に切り替える)
 * Field3D.update(farm) … ターンごとに田んぼの様子を反映 / start() stop() dispose() debugInfo() / onFail(e)
 * 色は sRGB で書いて線形に直してから使う(出力は sRGB+ACES)。稲は「株」を葉の束で作り InstancedMesh で並べる。
 */
(function () {
  'use strict';
  const F3 = {};
  let THREE, renderer, scene, camera, canvas;
  let anthers = null, antherTex = null;
  let handPlanter = null, hillsRefl = null, sideMudMat = null;
  let chibi = null; let hills, panicles, shadows, grass, water, mud, farPlane, sideFields = [], rain, nursery, hemi, sun, sky, clouds = [], heron, flies, straw, swallows, lilies, springFlowers, hieG, sparrows, leakHole, nagaeG, snailG, eggG, weedG = {}, farmer, tractor, planter, valve, mizoG, combine, tHerons = [], cumulus = [], uroko = null, rotNear = null, residue = null, lilyStem = null, blastG = null, sheathG = null, bphG = null, husks = null, leftRice = null, debris = null, ripples = null, lifeG = {}, perched = null;
  let envClear = null, envRain = null, waterNormal = null, texMud = null, texDry = null, texDryFine = null, texTill = null, pmrem = null;
  let layoutKey = '', hillPos = [];
  const uniforms = { uTime: { value: 0 }, uWind: { value: 0.8 }, uSen: { value: 0 }, uSkyW: { value: 1 } };   /* uSkyW: 水にうつる青空の強さ(晴れ1・雨0.2) */
  let lodgeAxis = null, qLodge = null;   // 倒伏: 風(台風)の向きで、みな同じ向きに倒れる【設定】
  let raining = false, running = false, lastFrame = 0, closeView = false, yaw = 0, pitch = 0, showFlies = false, focusKind = null, focusDoy = -1;
  // 見回りで見つけたものを近くで見る視点(カメラの位置 p と見る先 t)
  const FOCUS = { dojo: { p: [0.95, 0.26, 0.02], t: [1.13, 0.03, -0.34] }, life: { p: [1.1, 0.75, 0.3], t: [1.15, 0.0, -0.55] }, leak: { p: [-2.5, 1.9, 1.75], t: [-2.6, 0.1, 0.75] }, nagae: { p: [1.0, 1.2, 0.3], t: [1.5, 0.0, -0.45] }, hie: { p: [-1.0, 1.3, 0.55], t: [-0.55, 0.8, -1.3] }, bird: { p: [0.05, 1.4, 0.35], t: [0.15, 0.9, -1.3] }, snail: { p: [0.0, 0.72, 0.02], t: [0.1, 0.0, -0.5] }, blast: { p: [1.05, 0.55, -0.12], t: [1.05, 0.3, -0.5] }, kame: { p: [1.4, 1.6, -0.9], t: [2.6, 0.7, -3.8] }, sheath: { p: [-0.15, 0.3, -0.22], t: [-0.2, 0.1, -0.45] }, bph: { p: [0.5, 0.24, -0.25], t: [0.45, 0.08, -0.5] }, rot: { p: [6.6, 1.5, 0.9], t: [10.5, 0.2, -3.5] }, left: { p: [-6.6, 1.5, 0.9], t: [-10.5, 0.2, -3.5] }, konagi: { p: [0.15, 0.95, -0.05], t: [0.3, 0.0, -0.75] }, omodaka: { p: [0.15, 1.05, -0.05], t: [0.3, 0.1, -0.75] }, kurogwai: { p: [0.15, 1.05, -0.05], t: [0.3, 0.15, -0.75] }, ibokusa: { p: [-0.9, 0.7, -0.12], t: [-0.75, 0.0, -0.32] }, egg: { p: [-0.25, 0.55, -0.02], t: [0.0, 0.12, -0.5] } };
  const HEIGHT = { koshi: 0.97, kokoro: 0.93, kaori: 0.96 }; // 稈長(県の実測 80〜82cm)+穂 約15cm
  const FIELD_W = 8.2, FIELD_D = 42;                          // 自分の田んぼ: 幅16.4m・奥行き42m(約7a)
  // 画質: high(葉18枚・穂8本・解像度1.75倍)/ low(葉8枚・穂4本・1.25倍)。非力な端末や描画が遅いときは low
  const QUALITY = { high: { blades: 18, pan: 8, dpr: 1.75 }, low: { blades: 8, pan: 4, dpr: 1.25 } };
  let quality = 'high', lastFarm = null;
  const stats = { renders: 0, renderMs: 0, interval: 0, lastAt: 0, firstAfterUpdate: null, updatedAt: 0 };
  const rnd = mulberry(20261022);
  function mulberry(a) { return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  const dateOf3 = (doy) => { const md = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]; let m = 0; while (doy > md[m]) { doy -= md[m]; m++; } return m + 1; };   // 月だけほしいとき
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const lin = (hex) => new THREE.Color(hex).convertSRGBToLinear();
  const hsl = (h, s, l) => new THREE.Color().setHSL(h / 360, s, l).convertSRGBToLinear();

  // ---------- テクスチャ(すべてコードで描く。画像ファイルは使わない) ----------
  function canvasTex(w, h, draw, repeat, color = true) {
    const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; if (repeat) t.repeat.set(repeat[0], repeat[1]);
    if (color) t.encoding = THREE.sRGBEncoding; t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    return t;
  }
  function speckle(g, w, h, base, n, cols, size) { g.fillStyle = base; g.fillRect(0, 0, w, h); for (let i = 0; i < n; i++) { g.fillStyle = cols[i % cols.length]; const s = size * (0.4 + rnd()); g.globalAlpha = 0.25 + rnd() * 0.5; g.fillRect(rnd() * w, rnd() * h, s, s); } g.globalAlpha = 1; }
  function makeTextures() {
    texMud = canvasTex(256, 256, (g, w, h) => speckle(g, w, h, '#6a5840', 5000, ['#57472f', '#7f6c4e', '#4a3c2a', '#8d7a5a'], 3), [16, 40]);   /* 細かい泥のむら(大きくぼけた模様にしない) */
    // 中干しで乾いた田面: ひび割れ
    texDry = canvasTex(128, 128, (g, w, h) => {   // 中干しで乾いた田面: 泥が縮んで、多角形に割れる(ひびのすき間は暗く、割れた土の面は白っぽく乾く)
      for (let i = 0; i < 16840; i++) rnd();   // 前の絵(ざらざら+ひびの線)と同じ数だけ景色の乱数を進める(家や木の並びを変えない)
      const r3 = mulberry(4242), N = 24, pts = []; for (let i = 0; i < N; i++) pts.push([r3() * w, r3() * h]);
      const img = g.createImageData(w, h);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        let d1 = 1e9, d2 = 1e9;
        for (const [px, py] of pts) for (const ox of [-w, 0, w]) for (const oy of [-h, 0, h]) { const dx = x - px - ox, dy = y - py - oy, dd = dx * dx + dy * dy; if (dd < d1) { d2 = d1; d1 = dd; } else if (dd < d2) d2 = dd; }
        const edge = Math.sqrt(d2) - Math.sqrt(d1), crack = edge < 1.6 ? 1 : edge < 3 ? 0.4 : 0, n = (Math.sin(x * 0.9) * Math.cos(y * 1.3) + r3()) * 6, lift = Math.min(1, edge / 18);
        const R = 92 + 26 * lift + n, G = 80 + 21 * lift + n, B = 64 + 15 * lift + n, i4 = (y * w + x) * 4;   // 代かきでならした泥が乾いた色(灰褐色・畑土より暗い)
        img.data[i4] = R * (1 - 0.62 * crack); img.data[i4 + 1] = G * (1 - 0.64 * crack); img.data[i4 + 2] = B * (1 - 0.66 * crack); img.data[i4 + 3] = 255;
      }
      g.putImageData(img, 0, 0);
    }, [11, 11]);
    /* 田面の段階(レビュー2回目 1): 田起こしの後=土のかたまりと耕うんの筋/中干し・落水のはじめ=細かいひび。どちらも景色の乱数 rnd() は使わない */
    const voro = (g, w, h, seed, N, paint) => { const r = mulberry(seed), pts = []; for (let i = 0; i < N; i++) pts.push([r() * w, r() * h, r()]); const img = g.createImageData(w, h);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let d1 = 1e9, d2 = 1e9, k1 = 0; for (const [px, py, pk] of pts) for (const ox of [-w, 0, w]) for (const oy of [-h, 0, h]) { const dx = x - px - ox, dy = y - py - oy, dd = dx * dx + dy * dy; if (dd < d1) { d2 = d1; d1 = dd; k1 = pk; } else if (dd < d2) d2 = dd; }
        const c = paint(x, y, Math.sqrt(d2) - Math.sqrt(d1), Math.sqrt(d1), k1, r), i4 = (y * w + x) * 4; img.data[i4] = c[0]; img.data[i4 + 1] = c[1]; img.data[i4 + 2] = c[2]; img.data[i4 + 3] = 255; }
      g.putImageData(img, 0, 0); };
    texTill = canvasTex(128, 128, (g, w, h) => voro(g, w, h, 5151, 190, (x, y, edge, d1, k, r) => {   /* 耕した土: 小さなかたまりがばらばら(明るさ・大きさがまちまち・すき間はやわらかく暗い)+耕うんの筋 */
      const top = Math.pow(Math.min(1, edge / 3.2), 0.6), lit = 0.62 + 0.38 * top + 0.32 * (k - 0.5) - 0.02 * Math.max(0, d1 - 4), fur = 0.88 + 0.12 * Math.cos(y / h * 2 * Math.PI * 9 + Math.sin(x * 0.2)), n = (r() - 0.5) * 22, v = lit * fur;
      return [Math.max(0, 120 * v + n) | 0, Math.max(0, 101 * v + n * 0.9) | 0, Math.max(0, 79 * v + n * 0.8) | 0]; }), [16, 16]);
    texDryFine = canvasTex(128, 128, (g, w, h) => voro(g, w, h, 6262, 46, (x, y, edge, d1, k, r) => {   /* 乾きはじめ: 細いひびと、まだしめった暗めの泥 */
      const crack = edge < 0.8 ? 0.5 : edge < 1.6 ? 0.2 : 0, n = (r() - 0.5) * 8, base = 0.9 + 0.08 * k;
      return [((84 * base + n) * (1 - crack)) | 0, ((72 * base + n) * (1 - crack)) | 0, ((57 * base + n) * (1 - crack)) | 0]; }), [11, 11]);
    // 水面のさざ波(法線マップ)
    waterNormal = canvasTex(256, 256, (g, w, h) => {
      const img = g.createImageData(w, h), hgt = new Float32Array(w * h);
      for (let k = 0; k < 24; k++) { const fx = (1 + Math.floor(rnd() * 6)) * 2 * Math.PI / w, fy = (1 + Math.floor(rnd() * 6)) * 2 * Math.PI / h, ph = rnd() * 6.3, a = 1 / (1 + k * 0.3);
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) hgt[y * w + x] += a * Math.sin(fx * x + fy * y + ph); }
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const i = y * w + x, dx = hgt[y * w + (x + 1) % w] - hgt[i], dy = hgt[((y + 1) % h) * w + x] - hgt[i];
        const nx = -dx * 2, ny = -dy * 2, nz = 1, L = Math.hypot(nx, ny, nz);
        img.data[i * 4] = (nx / L * 0.5 + 0.5) * 255; img.data[i * 4 + 1] = (ny / L * 0.5 + 0.5) * 255; img.data[i * 4 + 2] = (nz / L * 0.5 + 0.5) * 255; img.data[i * 4 + 3] = 255;
      }
      g.putImageData(img, 0, 0);
    }, [10, 10], false);
  }

  // ---------- 空(グラデーション+太陽)と雲 ----------
  const SKY = {
    clear: { top: '#4f86c6', hor: '#cfe0ea', sun: 1.0 },
    rain: { top: '#7d8790', hor: '#aeb5ba', sun: 0.0 },
  };
  function buildSky() {
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { top: { value: lin(SKY.clear.top) }, hor: { value: lin(SKY.clear.hor) }, sunDir: { value: new THREE.Vector3(0.3, 0.6, -0.7).normalize() }, sunAmt: { value: 1 } },
      vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `uniform vec3 top; uniform vec3 hor; uniform vec3 sunDir; uniform float sunAmt; varying vec3 vDir;
        void main(){ float h = clamp(vDir.y, -1.0, 1.0); vec3 c = mix(hor, top, pow(max(h, 0.0), 0.55));
          if (h < 0.0) c = hor * 0.92;
          float s = max(dot(normalize(vDir), sunDir), 0.0); c += sunAmt * (vec3(1.0,0.86,0.62) * pow(s, 48.0) * 1.6 + vec3(1.0,0.9,0.75) * pow(s, 6.0) * 0.18);
          gl_FragColor = vec4(c, 1.0);
          #include <tonemapping_fragment>
          #include <encodings_fragment>
        }`,
    });
    sky = new THREE.Mesh(new THREE.SphereGeometry(900, 32, 16), mat); scene.add(sky);
    const ctex = canvasTex(256, 128, (g, w, h) => {
      g.clearRect(0, 0, w, h);
      for (let i = 0; i < 26; i++) { const x = w * (0.18 + 0.64 * rnd()), y = h * (0.45 + 0.25 * rnd()), r = 18 + rnd() * 30;
        const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, 'rgba(255,255,255,0.85)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); }
    }, null);
    ctex.wrapS = ctex.wrapT = THREE.ClampToEdgeWrapping;
    for (let i = 0; i < 9; i++) {
      const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: ctex, transparent: true, depthWrite: false, fog: false, color: 0xffffff, opacity: 0.9 }));
      const a = -1.2 + i * 0.3 + rnd() * 0.2, d = 520 + rnd() * 200;
      m.position.set(Math.sin(a) * d, 70 + rnd() * 90, -Math.cos(a) * d); m.scale.set(260 + rnd() * 160, 90 + rnd() * 50, 1); m.userData.h = m.scale.y;
      scene.add(m); clouds.push(m);
    }
    // 季節の空(景色の乱数を動かさないよう別の乱数で): 夏(7〜8月)の晴れの日は地平線に入道雲、秋(9〜10月)は高い空にうろこ雲
    const r2 = mulberry(1907);
    const cuTex = canvasTex(256, 256, (g, w, h) => { g.clearRect(0, 0, w, h);
      for (let i = 0; i < 70; i++) { const t = r2(), y = h * (0.92 - 0.75 * t), spread = w * (0.36 - 0.2 * t) , x = w / 2 + (r2() - 0.5) * 2 * spread, rr = 16 + 26 * (1 - t) * r2() + 10;
        const gr = g.createRadialGradient(x, y - rr * 0.3, 0, x, y, rr); const sh = Math.round(255 - 40 * (y / h) ** 2); gr.addColorStop(0, `rgba(255,255,255,0.95)`); gr.addColorStop(0.7, `rgba(${sh},${sh},${sh + 4},0.85)`); gr.addColorStop(1, 'rgba(240,240,245,0)'); g.fillStyle = gr; g.beginPath(); g.arc(x, y, rr, 0, 7); g.fill(); } }, null);
    for (const [a, d, sc] of [[-0.55, 760, 1], [0.35, 820, 0.8]]) { const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: cuTex, transparent: true, depthWrite: false, fog: false })); m.position.set(Math.sin(a) * d, 105 * sc, -Math.cos(a) * d); m.scale.set(270 * sc, 270 * sc, 1); m.visible = false; scene.add(m); cumulus.push(m); }
    const urTex = canvasTex(512, 256, (g, w, h) => { g.clearRect(0, 0, w, h); for (let row = 0; row < 14; row++) for (let i = 0; i < 26; i++) { const x = (i + (row % 2) * 0.5) * w / 26 + (r2() - 0.5) * 6, y = h * (0.15 + row * 0.055) + (r2() - 0.5) * 4, rr = 5 + r2() * 4; g.fillStyle = `rgba(255,255,255,${0.35 + 0.35 * r2()})`; g.beginPath(); g.ellipse(x, y, rr * 1.4, rr, 0, 0, 7); g.fill(); }
      g.globalCompositeOperation = 'destination-in'; const fx = g.createRadialGradient(w / 2, h / 2, 10, w / 2, h / 2, h * 0.62); fx.addColorStop(0, 'rgba(0,0,0,1)'); fx.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = fx; g.setTransform(w / h, 0, 0, 1, 0, 0); g.fillRect(0, 0, h, h); g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'source-over'; }, null);   // ふちをぼかす
    uroko = new THREE.Mesh(new THREE.PlaneGeometry(1400, 700), new THREE.MeshBasicMaterial({ map: urTex, transparent: true, depthWrite: false, fog: false, opacity: 0.8 })); uroko.rotation.x = Math.PI / 2; uroko.position.set(0, 140, -620); uroko.material.side = THREE.DoubleSide; uroko.visible = false; scene.add(uroko);
  }
  // 空を映す環境マップ(晴れ・雨の2種類を最初に作っておく)
  function buildEnv() {
    pmrem = new THREE.PMREMGenerator(renderer);
    // fromScene の撮影範囲は既定で100mまで。空の球(半径900m)を半径50mに縮めて写す(縮めても見える向きと色は同じ)
    const mk = (k) => { setSky(k); const s = new THREE.Scene(); const c = sky.clone(); c.scale.setScalar(50 / 900); s.add(c); return pmrem.fromScene(s, 0.02, 0.1, 200).texture; };
    envClear = mk('clear'); envRain = mk('rain'); setSky('clear');
  }
  function setSky(k) {
    const S = SKY[k]; sky.material.uniforms.top.value.copy(lin(S.top)); sky.material.uniforms.hor.value.copy(lin(S.hor)); sky.material.uniforms.sunAmt.value = S.sun;
    if (scene.fog) scene.fog.color.copy(lin(S.hor));
    clouds.forEach((c) => { c.material.color.copy(k === 'rain' ? lin('#8f969b') : lin('#ffffff')); c.material.opacity = k === 'rain' ? 1 : 0.85; c.scale.y = (k === 'rain' ? 1.6 : 1) * c.userData.h; });
  }

  // ---------- 稲の形 ----------
  // 株: n枚の葉(細長いリボン)。高さ1・根元が原点。uv.y=0(根元)〜1(先端)。葉ごとに色を少し変える
  function hillGeometry(nBlades, segs, width, lean0, lean1, shade) {
    const pos = [], col = [], uv = [], idx = [];
    for (let b = 0; b < nBlades; b++) {
      const az = (b / nBlades) * Math.PI * 2 + rnd() * 0.5, lean = lean0 + rnd() * (lean1 - lean0), hgt = 0.68 + rnd() * 0.32, tone = 0.86 + rnd() * 0.22;
      const droop = 0.25 + rnd() * 0.5, twist = (rnd() - 0.5) * 0.6;                    // 先が弓なりに垂れる・少しねじれる
      const ca = Math.cos(az), sa = Math.sin(az), base = pos.length / 3;
      for (let s = 0; s <= segs; s++) {
        const t = s / segs, w = width * (1.15 - t * 0.95) * 0.5;                       // 根元が太く先が細い
        const out = lean * Math.pow(t, 1.4) + droop * lean * t * t * 0.6, y = hgt * (t - (0.3 + droop * 0.45) * lean * t * t);
        const cx = ca * out, cz = sa * out, tw = az + twist * t, px = -Math.sin(tw), pz = Math.cos(tw);
        pos.push(cx - px * w, y, cz - pz * w, cx + px * w, y, cz + pz * w);
        const c = (shade + (1 - shade) * t) * tone, tip = Math.max(0, t - 0.75) * 0.6;  // 葉先は少し黄みがかって明るい
        col.push(c * (1 + tip * 0.35), c * (1 + tip * 0.2), c * (0.95 - tip * 0.3), c * (1 + tip * 0.35), c * (1 + tip * 0.2), c * (0.95 - tip * 0.3));
        uv.push(0, t, 1, t);
      }
      for (let s = 0; s < segs; s++) { const a = base + s * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    }
    return geo(pos, col, uv, idx);
  }
  // 稲の株: 下は茎(葉鞘)が束になってまっすぐ立ち、葉は途中から外へ開いて弓なりに垂れる(草のように根元から開かない)
  function riceHillGeometry(nBlades, segs) {
    const pos = [], col = [], uv = [], idx = [];
    const wide = nBlades <= 12 ? 2.0 : 1, fan = nBlades <= 12 ? 1.45 : 1, soft = nBlades <= 12 ? 1.35 : 1;   /* 植えたての苗: 葉は幅があり、先がやわらかくしなる */   /* 植えたての苗は葉がV字に開く */   /* 植えたての苗は小さく描くので、葉が針金に見えないよう幅を足す */
    for (let b = 0; b < nBlades; b++) {
      const az = (b / nBlades) * Math.PI * 2 + rnd() * 0.5, ca = Math.cos(az), sa = Math.sin(az), base = pos.length / 3, tone = 0.86 + rnd() * 0.22;
      const hgt = 0.74 + rnd() * 0.26, hc = 0.28 + rnd() * 0.22, foot = 0.015 + rnd() * 0.03;   // 葉の付け根の高さ・株元の広がり
      const a0 = (0.08 + rnd() * 0.3) * fan, bend = (0.42 + rnd() * 0.7) * soft, twist = (rnd() - 0.5) * 0.6, L = hgt * (1 - hc) * 1.15;   // 稲の葉は上を向き、先だけ弓なりに垂れる(草のように横へ広がらない)
      let out = foot, y = hc * hgt;
      for (let s = 0; s <= segs; s++) {
        let cx, cy, w, t;
        if (s === 0) { cx = foot * 0.35; cy = 0; w = 0.006; t = 0; }                      // 株元
        else if (s === 1) { cx = foot; cy = hc * hgt; w = 0.007; t = hc; }               // 葉の付け根(ここまでは茎の束)
        else { const u = (s - 1) / (segs - 1), ang = a0 + bend * u * u; out += Math.sin(ang) * L / (segs - 1); y += Math.cos(ang) * L / (segs - 1); cx = out; cy = y; w = (0.017 * Math.sin(Math.PI * (0.1 + 0.86 * u)) + 0.0008) * wide;   /* 葉先はもっと細く */ t = hc + (1 - hc) * u; }
        const tw = az + twist * t, px = -Math.sin(tw), pz = Math.cos(tw), x = ca * cx, z = sa * cx;
        pos.push(x - px * w * 0.5, cy, z - pz * w * 0.5, x + px * w * 0.5, cy, z + pz * w * 0.5);
        const c = (soft > 1 ? 0.3 + 0.7 * t : 0.4 + 0.6 * t) * tone, tip = Math.max(0, t - 0.8) * (soft > 1 ? 0.25 : 0.6);   /* 植えたての苗: 株元は濃く、葉先の白っぽい光は弱く */
        col.push(c * (1 + tip * 0.35), c * (1 + tip * 0.2), c * (0.95 - tip * 0.3), c * (1 + tip * 0.35), c * (1 + tip * 0.2), c * (0.95 - tip * 0.3));
        uv.push(0, t, 1, t);
      }
      for (let s = 0; s < segs; s++) { const a = base + s * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    }
    // 茎の束: 株元から何本もの茎(葉鞘)がまっすぐ立ち、その上で葉が開く。乱数は使わない(景色の並びを変えない)
    const nc = Math.max(3, Math.round(nBlades * 0.6)), V3 = THREE.Vector3, cA = nBlades <= 12 ? new THREE.Color(0.34, 0.47, 0.22) : new THREE.Color(0.52, 0.62, 0.36), cB = nBlades <= 12 ? new THREE.Color(0.6, 0.74, 0.38) : new THREE.Color(0.75, 0.86, 0.5);
    for (let k = 0; k < nc; k++) { const az = k * 2.39996, r = 0.006 + 0.02 * ((k * 37) % 10) / 10, h = 0.3 + 0.18 * ((k * 53) % 10) / 10, lean = 0.04 + 0.05 * ((k * 71) % 10) / 10;
      const b0 = pos.length / 3; crossRibbon(pos, col, uv, idx, new V3(Math.cos(az) * r, 0, Math.sin(az) * r), new V3(Math.cos(az) * (r + lean), h, Math.sin(az) * (r + lean)), 0.007, cA, cB);
      for (let q = b0; q < pos.length / 3; q++) uv[q * 2 + 1] *= h; }   // 風のゆれは茎の高さに合わせて小さく
    return geo(pos, col, uv, idx);
  }
  // 穂: 籾が並んだ細い帯(籾の形は透明テクスチャ)。droop=0(出たばかり)〜1(実って垂れる)
  function panicleGeometry(droop) {
    const pos = [], col = [], uv = [], idx = [], n = QUALITY[quality].pan, segs = quality === 'high' ? 6 : 4, cross = quality === 'high';
    const strip = (C, S, sh) => { const base = pos.length / 3; C.forEach((c, s) => { const t = s / segs, w = S[s]; pos.push(c[0] - w[0], c[1] - w[1], c[2] - w[2], c[0] + w[0], c[1] + w[1], c[2] + w[2]); col.push(sh, sh, sh, sh, sh, sh); uv.push(0, t, 1, t); }); for (let s = 0; s < segs; s++) { const q = base + s * 2; idx.push(q, q + 1, q + 2, q + 1, q + 3, q + 2); } };
    for (let b = 0; b < n; b++) {
      const az = (b / n) * Math.PI * 2 + rnd() * 0.6, ca = Math.cos(az), sa = Math.sin(az), px = -sa, pz = ca;
      const len = 0.24 + rnd() * 0.07, a0 = 0.12 + rnd() * 0.15 + droop * 0.25;   // 穂首は少し外へ傾いて伸びる(穂の長さ約20cm+穂首)
      const turn = (0.35 + droop * 3.1) * (0.8 + rnd() * 0.4);                   /* 実るほど弓なりに曲がり、熟すと先が下を向く(稲穂が頭を垂れる) */
      let out = 0.015 + rnd() * 0.035, y = 0.93 + rnd() * 0.07;   // 穂は止め葉(いちばん上の葉)より上に出る
      const C = [], S1 = [], S2 = [];
      for (let s = 0; s <= segs; s++) {
        const t = s / segs, w = t < 0.15 ? 0.006 : 0.055 * (0.55 + 0.6 * Math.sin(Math.PI * (0.1 + t * 0.75))) * (1 - 0.3 * droop * t);   // 穂首は細い軸だけ。実るほど穂は細くまとまって垂れる   // 枝が広がる分、帯を広く。先は細い
        const ang = a0 + turn * t;                                                           // この点での穂の向き(縦からの角度)
        C.push([ca * out, y, sa * out]); S1.push([px * w, 0, pz * w]);
        const dx = Math.sin(ang), dy = Math.cos(ang); S2.push([-ca * dy * w * 0.85, dx * w * 0.85, -sa * dy * w * 0.85]);   // 穂の向きと1枚目の帯の両方に直角
        const ang2 = a0 + turn * (t + 0.5 / segs); out += Math.sin(ang2) * len / segs; y += Math.cos(ang2) * len / segs;
      }
      strip(C, S1, 1);
      if (cross) strip(C, S2, 0.9);   // 2枚目の帯を直角に重ねて、どの向きから見ても穂に厚みが出る(高画質のときだけ)
    }
    return geo(pos, col, uv, idx);
  }
  function geo(pos, col, uv, idx) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx); g.computeVertexNormals();
    return g;
  }
  /* 固定部品を頂点色つきの一枚にまとめる */
  function modelParts() {
    const pos = [], col = [], uv = [], idx = [], normals = [];
    const add = (g, color, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => {
      g.rotateX(rx); g.rotateY(ry); g.rotateZ(rz); g.translate(x, y, z);
      const p = g.attributes.position, t = g.attributes.uv, n = g.attributes.normal, c = lin(color), base = pos.length / 3;
      for (let i = 0; i < p.count; i++) { pos.push(p.getX(i), p.getY(i), p.getZ(i)); col.push(c.r, c.g, c.b); uv.push(t ? t.getX(i) : 0, t ? t.getY(i) : 0); normals.push(n.getX(i), n.getY(i), n.getZ(i)); }
      for (let i = 0; i < (g.index ? g.index.count : p.count); i++) idx.push(base + (g.index ? g.index.getX(i) : i));
      g.dispose();
    };
    return { add,
      box: (w, h, d, c, x, y, z, rx = 0, ry = 0, rz = 0) => add(new THREE.BoxGeometry(w, h, d), c, x, y, z, rx, ry, rz),
      ell: (sx, sy, sz, c, x, y, z) => add(new THREE.SphereGeometry(1, 8, 6).scale(sx, sy, sz), c, x, y, z),
      rod: (a, b, r, c, sides = 6) => {
        const p = new THREE.Vector3(...a), q = new THREE.Vector3(...b), d = q.clone().sub(p);
        const g = new THREE.CylinderGeometry(r, r, d.length(), sides);
        g.applyMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize())));
        p.add(q).multiplyScalar(0.5); add(g, c, p.x, p.y, p.z);
      },
      finish: (parent, roughness = 0.75) => { const g = geo(pos, col, uv, idx); g.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3)); const m = new THREE.Mesh(g, std('#ffffff', roughness, { vertexColors: true })); parent.add(m); return m; }
    };
  }
  /* 上端の四辺を面取りした外装 */
  function topBevel(w, h, d, bevel) {
    const pos = [], col = [], uv = [], idx = [], rings = [];
    for (const [y, inset] of [[-h / 2, 0], [h / 2 - bevel, 0], [h / 2, bevel]]) rings.push([[-w / 2 + inset, y, -d / 2 + inset], [-w / 2 + inset, y, d / 2 - inset], [w / 2 - inset, y, d / 2 - inset], [w / 2 - inset, y, -d / 2 + inset]]);
    const face = (a, b, c, d0) => { const n = pos.length / 3; for (const p of [a, b, c, d0]) { pos.push(...p); col.push(1, 1, 1); uv.push(0, 0); } idx.push(n, n + 1, n + 2, n, n + 2, n + 3); };
    face(...rings[0].slice().reverse()); face(...rings[2]);
    for (let k = 0; k < 2; k++) for (let j = 0; j < 4; j++) { const n = (j + 1) % 4; face(rings[k][j], rings[k][n], rings[k + 1][n], rings[k + 1][j]); }
    return geo(pos, col, uv, idx);
  }
  /* 薄い輪郭を水平に押し出す */
  function flatPart(points, thickness) {
    const s = new THREE.Shape(); points.forEach(([x, z], i) => { if (i) s.lineTo(x, z); else s.moveTo(x, z); }); s.closePath();
    return new THREE.ExtrudeGeometry(s, { depth: thickness, bevelEnabled: false, steps: 1 }).rotateX(Math.PI / 2).translate(0, thickness / 2, 0);
  }
  // 細い帯を2枚十字に重ねる(どこから見ても細い棒・枝に見える)
  function crossRibbon(pos, col, uv, idx, a, b, w, ca, cb) {
    const d = b.clone().sub(a).normalize(), s1 = new THREE.Vector3().crossVectors(d, Math.abs(d.y) > 0.95 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0)).normalize().multiplyScalar(w / 2), s2 = new THREE.Vector3().crossVectors(d, s1).normalize().multiplyScalar(w / 2);
    for (const s of [s1, s2]) {
      const base = pos.length / 3;
      for (const [p, c, t] of [[a.clone().sub(s), ca, 0], [a.clone().add(s), ca, 0], [b.clone().sub(s), cb, 1], [b.clone().add(s), cb, 1]]) { pos.push(p.x, p.y, p.z); col.push(c.r, c.g, c.b); uv.push(0, t); }
      idx.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
    }
  }
  // ヒエの穂: まっすぐな軸から、短い枝が斜め上に何本も出る。小穂は緑〜赤紫(高さ約0.2)
  function hiePanicleGeometry(r) {
    const pos = [], col = [], uv = [], idx = [], g0 = lin('#a3b85a'), p0 = lin('#80506e'), V = THREE.Vector3;
    crossRibbon(pos, col, uv, idx, new V(0, -0.05, 0), new V(0.008, 0.21, 0), 0.004, g0, g0);
    const n = 10;
    for (let k = 0; k < n; k++) {
      const t = 0.12 + 0.88 * k / (n - 1), az = k * 2.4, ang = 0.25 + 0.45 * (1 - t), L = 0.075 * (1 - 0.5 * t) + r() * 0.015;
      const a = new V(0.008 * t, 0.21 * t, 0), b = a.clone().add(new V(Math.sin(ang) * Math.cos(az), Math.cos(ang), Math.sin(ang) * Math.sin(az)).multiplyScalar(L));
      const c = g0.clone().lerp(p0, 0.35 + r() * 0.5);
      crossRibbon(pos, col, uv, idx, a, b, 0.016, c.clone().multiplyScalar(0.85), c);
    }
    return geo(pos, col, uv, idx);
  }
  // ナガエツルノゲイトウのマット: 水面を這う茎→立ち上がる茎に向かい合った葉(節ごとに90度ずつ回る)と、柄の長い白い花。
  // 原点(水口のわき)から近い順に並べ、cut[k] で「k本目まで」を描く(広がるほど遠くまで)
  function nagaeGeometry(r) {
    const N = 420, V = THREE.Vector3, stems = [];
    for (let i = 0; i < N; i++) { const x = 0.35 + Math.pow(r(), 1.25) * 3.3, z = -0.08 - r() * (0.12 + 0.35 * (x - 0.35) / 3.3); stems.push({ x, z, d: (x - 0.35) + Math.abs(z) * 2 + r() * 0.3 }); }
    stems.sort((a, b) => a.d - b.d);
    const L = { pos: [], col: [], uv: [], idx: [] }, S = { pos: [], col: [], uv: [], idx: [] }, flowers = [], cut = [];
    const gStem = lin('#7f9447'), rStem = lin('#8f5d4a'), leafC = [lin('#4d8a30'), lin('#5c9a36'), lin('#447c2a')];
    for (const st of stems) {
      const dir = r() * 6.3, run = 0.06 + r() * 0.16, hgt = 0.12 + r() * 0.28, lean = (r() - 0.5) * 0.5;
      const p0 = new V(st.x, 0.002, st.z), p1 = p0.clone().add(new V(Math.cos(dir) * run, 0.004, Math.sin(dir) * run));   // 水面を這う
      crossRibbon(S.pos, S.col, S.uv, S.idx, p0, p1, 0.005, rStem, gStem);
      let prev = p1; const nodes = Math.max(2, Math.round(hgt / 0.035));
      for (let k = 1; k <= nodes; k++) {
        const t = k / nodes, q = p1.clone().add(new V(Math.cos(dir) * (0.03 * t + lean * 0.1 * t * t), hgt * t, Math.sin(dir) * (0.03 * t + lean * 0.1 * t * t)));
        crossRibbon(S.pos, S.col, S.uv, S.idx, prev, q, 0.0045, k === 1 ? rStem : gStem, gStem); prev = q;
        const az = dir + k * Math.PI / 2, ln = (0.04 + r() * 0.035) * (1 - 0.35 * t), w = ln * 0.22, c = leafC[Math.floor(r() * 3)].clone().multiplyScalar(0.85 + 0.3 * r());
        for (const sgn of [-1, 1]) {   // 向かい合った2枚。少し上向きで先がとがる
          const ax = new V(Math.cos(az) * sgn, 0.35, Math.sin(az) * sgn).normalize(), side = new V(-Math.sin(az), 0, Math.cos(az)).multiplyScalar(w / 2), base = L.pos.length / 3;
          const pts = [q, q.clone().addScaledVector(ax, ln * 0.4).add(side), q.clone().addScaledVector(ax, ln).add(new V(0, -ln * 0.15, 0)), q.clone().addScaledVector(ax, ln * 0.4).sub(side), q.clone().addScaledVector(ax, ln * 0.45).add(new V(0, w * 0.25, 0))];
          pts.forEach((p, j) => { L.pos.push(p.x, p.y, p.z); const m = j === 4 ? 1.15 : 1; L.col.push(c.r * m, c.g * m, c.b * m); L.uv.push(0, 0); });
          L.idx.push(base, base + 1, base + 4, base + 1, base + 2, base + 4, base + 4, base + 2, base + 3, base, base + 4, base + 3);
        }
        if (k >= nodes - 1 && r() < 0.6) {   // 上の節から長い柄をのばして、白い丸い花
          const fl = q.clone().add(new V(Math.cos(az) * 0.012, 0.025 + r() * 0.02, Math.sin(az) * 0.012));
          crossRibbon(S.pos, S.col, S.uv, S.idx, q, fl, 0.002, gStem, gStem); flowers.push(fl);
        }
      }
      cut.push({ leaf: L.idx.length, stem: S.idx.length, fl: flowers.length });
    }
    return { leaf: geo(L.pos, L.col, L.uv, L.idx), stem: geo(S.pos, S.col, S.uv, S.idx), flowers, cut };
  }
  let blobTex = null;
  function blobTexture() {
    if (blobTex) return blobTex;
    blobTex = canvasTex(64, 64, (g, w, h) => { const gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); }, null, false);
    blobTex.wrapS = blobTex.wrapT = THREE.ClampToEdgeWrapping; return blobTex;
  }
  let grainTex = null;
  function antherTexture() {
    if (antherTex) return antherTex;
    antherTex = canvasTex(64, 256, (g, w, h) => {
      g.clearRect(0, 0, w, h); const r = mulberry(7);
      for (let i = 0; i < 70; i++) { const x = 10 + r() * (w - 20), y = 10 + r() * (h - 24); g.strokeStyle = 'rgba(255,255,255,.9)'; g.lineWidth = 0.8; g.beginPath(); g.moveTo(x, y); g.lineTo(x + (r() - 0.5) * 3, y + 4 + r() * 3); g.stroke(); g.fillStyle = '#fffbe6'; g.beginPath(); g.ellipse(x + (r() - 0.5) * 3, y + 7 + r() * 3, 1.3, 2.6, 0, 0, 7); g.fill(); }   // 糸(花糸)の先に、白っぽい葯
    }, null);
    antherTex.wrapS = antherTex.wrapT = THREE.ClampToEdgeWrapping; return antherTex;
  }
  function grainTexture() {
    if (grainTex) return grainTex;
    // 本物の穂: まん中の軸から枝(一次枝梗)が左右交互に出て、枝にそって籾が並ぶ。先(下)ほど枝が短い
    grainTex = canvasTex(64, 256, (g, w, h) => {
      g.clearRect(0, 0, w, h); const cx = w / 2;
      g.strokeStyle = '#cfcfbf'; g.lineWidth = 2; g.beginPath(); g.moveTo(cx, 0); g.lineTo(cx, h - 6); g.stroke();   // 穂の軸
      const grain = (x, y, r) => { g.save(); g.translate(x, y); g.rotate(r); const gr = g.createLinearGradient(0, -6, 0, 6); gr.addColorStop(0, '#f4f1e2'); gr.addColorStop(1, '#ffffff'); g.fillStyle = gr; g.beginPath(); g.ellipse(0, 0, 2.6, 5.4, 0, 0, 7); g.fill(); g.fillStyle = 'rgba(120,110,80,.55)'; g.fillRect(-0.4, -5, 0.8, 10); g.restore(); };   // 籾(縦のすじ入り)
      const nB = 8;
      for (let k = 0; k < nB; k++) {
        const y0 = 8 + k * (h - 30) / nB, sx = k % 2 ? 1 : -1, L = 26 * (1 - k / (nB + 2)) + 6, ang = 0.42 + 0.1 * (k % 3);
        const x1 = cx + sx * Math.sin(ang) * L, y1 = y0 + Math.cos(ang) * L;
        g.strokeStyle = '#d8d6c4'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(cx, y0); g.lineTo(x1, y1); g.stroke();
        const n = Math.max(2, Math.round(L / 7));
        for (let i = 1; i <= n; i++) { const t = i / n, x = cx + (x1 - cx) * t, y = y0 + (y1 - y0) * t; grain(x + sx * 2.6, y - 1, sx * 0.5); if (i % 2) grain(x - sx * 2.2, y + 2, -sx * 0.25); }
      }
      for (let y = h - 30; y < h - 4; y += 7) grain(cx + (y % 2 ? 2 : -2), y, 0);   // 穂の先
    }, null);
    grainTex.wrapS = grainTex.wrapT = THREE.ClampToEdgeWrapping;
    return grainTex;
  }
  // 風: 田んぼの上を走る波(稲穂の波)+株ごとの小さなゆれ
  function swayMaterial(opts, senesce) {
    const m = new THREE.MeshLambertMaterial(Object.assign({ vertexColors: true, side: THREE.DoubleSide }, opts || {}));
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = uniforms.uTime; sh.uniforms.uWind = uniforms.uWind;
      if (senesce) {   // 実るにつれ、下の葉から黄色く枯れあがる。いちばん上の止め葉は最後まで緑が残る
        sh.uniforms.uSen = uniforms.uSen;
        sh.vertexShader = 'varying float vT;\n' + sh.vertexShader.replace('#include <uv_vertex>', '#include <uv_vertex>\n vT = uv.y;');
        sh.fragmentShader = 'uniform float uSen; varying float vT;\n' + sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
          float lum = dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11));
          float fy = uSen * smoothstep(0.85, 0.25, vT) + uSen * uSen * 0.35;
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0, 0.8, 0.36) * lum * 1.5, clamp(fy, 0.0, 0.95));`);
      }
      sh.vertexShader = 'uniform float uTime; uniform float uWind;\n' + sh.vertexShader.replace('#include <begin_vertex>',
        `#include <begin_vertex>
        #ifdef USE_INSTANCING
          vec2 wp = vec2(instanceMatrix[3].x, instanceMatrix[3].z);
        #else
          vec2 wp = vec2(0.0);
        #endif
        float gust = 0.5 + 0.5 * sin(dot(wp, vec2(0.35, -0.55)) - uTime * 1.6) + 0.25 * sin(dot(wp, vec2(-0.9, 0.4)) + uTime * 2.3);
        float k = uv.y * uv.y * uWind;
        transformed.x += (0.035 + 0.06 * gust) * k + sin(uTime * 2.1 + wp.x * 3.1) * 0.012 * k;
        transformed.z += (0.02 * gust) * k + cos(uTime * 1.7 + wp.y * 2.7) * 0.01 * k;`);
    };
    return m;
  }

  // ---------- 景色 ----------
  const std = (c, r = 0.9, extra) => new THREE.MeshStandardMaterial(Object.assign({ color: lin(c), roughness: r, metalness: 0 }, extra || {}));
  // 畦(台形の断面)を、長さ len で向き(0:横 / 1:奥行き)に置く
  function levee(len, along, x, z, topW, botW, h, mat) {
    const sh = new THREE.Shape(); sh.moveTo(-botW / 2, 0); sh.lineTo(botW / 2, 0); sh.lineTo(topW / 2, h); sh.lineTo(-topW / 2, h); sh.lineTo(-botW / 2, 0);
    const g = new THREE.ExtrudeGeometry(sh, { depth: len, bevelEnabled: false }); g.translate(0, 0, -len / 2);
    const m = new THREE.Mesh(g, mat); if (along === 0) m.rotation.y = Math.PI / 2; m.position.set(x, 0, z); scene.add(m); return m;
  }
  function buildScenery() {
    makeTextures();
    const grassMat = std('#ffffff', 1, { map: canvasTex(128, 128, (g, w, h) => { speckle(g, w, h, '#6d7d3b', 3000, ['#5b6b2e', '#7f8f46', '#4e5e28', '#8c9a52'], 2); }, [8, 1]) });
    // 田んぼの土と水
    mud = new THREE.Mesh(new THREE.PlaneGeometry(FIELD_W * 2, FIELD_D), std('#ffffff', 0.95, { map: texMud }));
    mud.rotation.x = -Math.PI / 2; mud.position.set(0, 0, -FIELD_D / 2); scene.add(mud);
    water = new THREE.Mesh(new THREE.PlaneGeometry(FIELD_W * 2, FIELD_D), new THREE.MeshStandardMaterial({ color: lin('#18202a'), roughness: 0.05, metalness: 0, transparent: true, opacity: 0.34, normalMap: waterNormal, normalScale: new THREE.Vector2(0.06, 0.06), envMapIntensity: 1.25 }));
    water.rotation.x = -Math.PI / 2; water.position.set(0, 0.03, -FIELD_D / 2); water.material.depthWrite = false; scene.add(water);
    const cloudR = canvasTex(128, 128, (g, w, h) => { const r = mulberry(7311); g.fillStyle = '#000'; g.fillRect(0, 0, w, h); for (let i = 0; i < 26; i++) { const x = r() * w, y = r() * h, rr = 10 + r() * 30; for (const [ox, oy] of [[0, 0], [w, 0], [-w, 0], [0, h], [0, -h]]) { const gr = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, rr); gr.addColorStop(0, 'rgba(255,255,255,' + (0.35 + r() * 0.4) + ')'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); } } }, null, false);   /* 水にうつる雲のむら(明るい所と暗い所) */
    water.material.onBeforeCompile = (sh) => { sh.uniforms.uSkyW = uniforms.uSkyW; sh.uniforms.uCloudR = { value: cloudR }; sh.fragmentShader = 'uniform float uSkyW; uniform sampler2D uCloudR;\n' + sh.fragmentShader.replace('#include <tonemapping_fragment>', 'float frW = pow(1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0), 1.6);\n float nearA = smoothstep(0.6, 2.6, length(vViewPosition));\n gl_FragColor.a = mix(gl_FragColor.a, 0.7, frW * nearA);\n float clR = texture2D(uCloudR, vUv * vec2(3.0, 7.0)).r;\n float nearW = nearA;\n vec3 skyC = mix(vec3(0.34, 0.45, 0.54), vec3(0.6, 0.66, 0.7), clR);\n gl_FragColor.rgb = mix(gl_FragColor.rgb, skyC, clamp(uSkyW * frW * nearW, 0.0, 0.62));\n#include <tonemapping_fragment>'); };   /* 浅い角度で見るほど空がうつり、泥は見えなくなる(フレネル) */   /* 水の下の泥・うつりこみ・長ぐつが透ける */
    // 奥の稲(条のすじ入りの平面)
    const rows = canvasTex(64, 256, (g, w, h) => {
      for (let x = 0; x < w; x++) { g.fillStyle = x % 4 < 3 ? '#ffffff' : '#9a9a9a'; g.fillRect(x, 0, 1, h); }
      for (let i = 0; i < 90; i++) { const v = 200 + Math.floor(rnd() * 55); g.fillStyle = `rgba(${v},${v},${v - 20},0.35)`; g.beginPath(); g.ellipse(rnd() * w, rnd() * h, 4 + rnd() * 10, 10 + rnd() * 30, 0, 0, 7); g.fill(); } // 色むら
    }, [FIELD_W * 2 / 4.8, 4]);
    farPlane = new THREE.Mesh(new THREE.PlaneGeometry(FIELD_W * 2, FIELD_D - 7.6), new THREE.MeshLambertMaterial({ color: lin('#4f8a3a'), map: rows }));
    farPlane.rotation.x = -Math.PI / 2; farPlane.position.set(0, 0.06, -7.6 - (FIELD_D - 7.6) / 2); farPlane.material.transparent = true; farPlane.renderOrder = 2; scene.add(farPlane);
    { const r = mulberry(4417); const dots = canvasTex(64, 256, (g, w, h) => { g.fillStyle = '#a2a2a2'; g.fillRect(0, 0, w, h); for (let x = 1.5; x < w; x += 4) for (let y = 2; y < h; y += 5.4) { const v = 225 + Math.floor(r() * 30); g.fillStyle = `rgb(${v},${v},${v - 10})`; g.beginPath(); g.ellipse(x + (r() - 0.5) * 0.8, y + (r() - 0.5) * 1.6, 1.1 + r() * 0.4, 2.0 + r() * 0.8, 0, 0, 7); g.fill(); } }, [FIELD_W * 2 / 4.8, 4]);
      farPlane.userData.rows = rows; farPlane.userData.dots = dots; }   /* 植えたてのころの奥の田: 条のすじではなく、株が1つずつの点に見える(水の上に点々) */   /* 植えたてのころは水がすけて見える(水のあとに描く) */
    // 畦: 手前・左右・奥
    levee(FIELD_W * 2 + 1, 0, 0, 0.45, 0.5, 1.1, 0.32, grassMat);
    levee(FIELD_D, 1, -FIELD_W - 0.35, -FIELD_D / 2, 0.35, 0.8, 0.25, grassMat);
    levee(FIELD_D, 1, FIELD_W + 0.35, -FIELD_D / 2, 0.35, 0.8, 0.25, grassMat);
    levee(FIELD_W * 2 + 1, 0, 0, -FIELD_D - 0.35, 0.35, 0.8, 0.25, grassMat);
    // 排水路(コンクリートのU字溝。用水はパイプラインで給水栓から入れる)と農道(砂利)
    const conc = std('#a7a49b', 0.85);
    for (const z of [1.05, 1.45]) { const w = new THREE.Mesh(new THREE.BoxGeometry(60, 0.38, 0.07), conc); w.position.set(0, 0.12, z); scene.add(w); }
    const ditchW = new THREE.Mesh(new THREE.PlaneGeometry(60, 0.33), new THREE.MeshStandardMaterial({ color: lin('#4e5a52'), roughness: 0.1, normalMap: waterNormal, envMapIntensity: 1 }));
    ditchW.rotation.x = -Math.PI / 2; ditchW.position.set(0, 0.05, 1.25); ditchW.name = 'ditch'; scene.add(ditchW);
    const road = new THREE.Mesh(new THREE.PlaneGeometry(60, 3.2), std('#ffffff', 1, { map: canvasTex(128, 128, (g, w, h) => speckle(g, w, h, '#9b958a', 4000, ['#857f74', '#b1ab9f', '#6f6a61', '#c2bdb2'], 2), [30, 2]) }));
    road.rotation.x = -Math.PI / 2; road.position.set(0, 0.01, 3.1); scene.add(road);
    // 隣の田んぼ(左右・奥)。色は自分の田んぼに合わせて少しずらす
    const nb = (x, z, w, d, shift, rot) => { const t = rows.clone(); t.repeat.set(w / 4.8, 1); t.needsUpdate = true; const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshLambertMaterial({ color: lin('#4f8a3a'), map: t })); m.rotation.x = -Math.PI / 2; m.position.set(x, 0.04, z); m.userData.shift = shift; m.userData.rot = !!rot; scene.add(m); sideFields.push(m);
      if (!rot) {   /* 稲の田: 下に泥と水を敷き、植えたてのころは点々の苗の間に水面が見える(写真B) */
        if (!sideMudMat) sideMudMat = std('#ffffff', 0.95, { map: texMud });
        const mp = new THREE.Mesh(new THREE.PlaneGeometry(w, d), sideMudMat); mp.rotation.x = -Math.PI / 2; mp.position.set(x, -0.005, z); mp.visible = false; scene.add(mp);
        const wp = new THREE.Mesh(new THREE.PlaneGeometry(w, d), water.material); wp.rotation.x = -Math.PI / 2; wp.position.set(x, 0.025, z); wp.visible = false; scene.add(wp);
        const dt = farPlane.userData.dots.clone(); dt.repeat.set(w / 4.8, 1); dt.needsUpdate = true;
        Object.assign(m.userData, { mp, wp, rows: t, dots: dt }); m.material.transparent = true; m.renderOrder = 2;
      } };   /* rot=今年は麦→大豆の区画(2年3作のブロックローテーション) */
    nb(-FIELD_W - 9.2, -FIELD_D / 2, 17, FIELD_D, -0.1); nb(FIELD_W + 9.2, -FIELD_D / 2, 17, FIELD_D, 0.12, true);
    for (let i = -3; i <= 3; i++) nb(i * 17.6, -FIELD_D - 22, 17, 42, (i % 3) * 0.08, i === -2 || i === 1 || i === 3);
    for (let i = -3; i <= 3; i++) if (i) levee(42, 1, i * 17.6 - 8.8, -FIELD_D - 22, 0.3, 0.7, 0.22, grassMat);
    // 畦の草(手前の畦に密に)。刈ると短くなる
    const gg = hillGeometry(6, 2, 0.026, 0.15, 0.7, 0.45);   // 畦の草: 幅のある葉の株(根元は暗く)
    grass = new THREE.InstancedMesh(gg, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }), 1800);
    const M = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s1 = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3();
    for (let i = 0; i < 1800; i++) {
      const onFront = i < 1300; p.set(onFront ? (rnd() - 0.5) * 22 : (rnd() < 0.5 ? -1 : 1) * (FIELD_W + 0.35 + (rnd() - 0.5) * 0.3), onFront ? 0.31 : 0.25, onFront ? 0.36 + rnd() * 0.32 : -rnd() * 12);
      e.set(0, rnd() * 6.3, 0); q.setFromEuler(e); M.compose(p, q, s1); grass.setMatrixAt(i, M); grass.setColorAt(i, hsl(78 + rnd() * 25, 0.4 + rnd() * 0.1, 0.3 + rnd() * 0.12));
    }
    scene.add(grass);
    // 遠くの山並み(三河の山。霧でかすむ)
    for (const [z, col, hgt, seed] of [[-640, '#8d9eaa', 85, 5], [-520, '#7d8f9a', 70, 3], [-380, '#6f8378', 45, 7]]) {   /* 奥ほど高く、うすくかすむ */
      const sh = new THREE.Shape(); sh.moveTo(-900, 0); const r2 = mulberry(seed);
      for (let x = -900; x <= 900; x += 12) sh.lineTo(x, hgt * (0.35 + 0.45 * Math.abs(Math.sin(x / 210 + seed)) + 0.15 * Math.sin(x / 63 + seed * 2) + 0.06 * Math.sin(x / 19 + seed)) + r2() * 5);   // 大きな峰+中くらいの尾根+小さな凸凹
      sh.lineTo(900, 0); sh.lineTo(-900, 0);
      const m = new THREE.Mesh(new THREE.ShapeGeometry(sh), new THREE.MeshBasicMaterial({ color: lin(col), fog: true })); m.position.set(0, -2, z); scene.add(m);
    }
    // 集落: 白壁と瓦屋根の農家・納屋・屋敷林
    const wall = std('#e9e4d8', 0.9), roof = std('#3b4148', 0.6), shed = std('#8a8f93', 0.5), wood = std('#6b4f36', 0.9), glass = std('#2c3238', 0.3), panel = std('#1d2a44', 0.25);
    const treeMats = ['#2f4a2a', '#3b5a30', '#456833'].map((c) => std(c, 1, { flatShading: true }));
    // 木: 丸い玉ひとつではなく、幹+でこぼこした葉のかたまり数個(広葉樹)/細長い常緑樹(屋敷林の槙・杉など)
    const lumpy = (r, seed) => { const g = new THREE.IcosahedronGeometry(r, 1), p = g.attributes.position, rr = mulberry(seed); for (let i = 0; i < p.count; i++) { const k = 0.78 + rr() * 0.4; p.setXYZ(i, p.getX(i) * k, p.getY(i) * k * 0.85, p.getZ(i) * k); } g.computeVertexNormals(); return g; };
    // 木は数百個の部品になるので、材質ごとに1つにまとめて描く(描画呼び出しを減らす)
    const batches = new Map();
    const addB = (m) => { m.updateMatrix(); let g = m.geometry.clone().applyMatrix4(m.matrix); if (g.index) g = g.toNonIndexed(); const k = m.material.uuid; if (!batches.has(k)) batches.set(k, { mat: m.material, pos: [], nor: [] }); const b = batches.get(k); b.pos.push(...g.attributes.position.array); b.nor.push(...g.attributes.normal.array); g.dispose(); };
    const flushB = () => { for (const { mat, pos, nor } of batches.values()) { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); scene.add(new THREE.Mesh(g, mat)); } batches.clear(); };
    const lumps = [lumpy(1, 11), lumpy(1, 23), lumpy(1, 37)], trunkMat = std('#4a3b2c', 1), conMat = std('#26381f', 1, { flatShading: true });
    const broadTree = (x, z, k) => {
      const h = 2 + rnd() * 1.8, tr = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.32, h, 6), trunkMat); tr.position.set(x, h / 2, z); addB(tr);
      const R = 2.6 + rnd() * 1.8;
      for (let c = 0; c < 7; c++) { const m = new THREE.Mesh(lumps[(c + k) % 3], treeMats[(c + k) % 3]); const rr = R * (0.55 + rnd() * 0.35); m.scale.set(rr, rr, rr); m.position.set(x + (rnd() - 0.5) * R * 1.1, h + R * 0.3 + (rnd() - 0.3) * R * 0.7, z + (rnd() - 0.5) * R * 1.1); addB(m); }
    };
    const conifer = (x, z) => {
      const h = 7 + rnd() * 4; const tr = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.2, h * 0.4, 5), trunkMat); tr.position.set(x, h * 0.2, z); addB(tr);
      for (let c = 0; c < 3; c++) { const m = new THREE.Mesh(new THREE.ConeGeometry(1.5 - c * 0.35, h * 0.45, 7), conMat); m.position.set(x, h * (0.38 + c * 0.2), z); m.rotation.y = rnd() * 3; addB(m); }
    };
    const village = (x0, z0, n) => {
      for (let i = 0; i < n; i++) {
        const x = x0 + (rnd() - 0.5) * 60, z = z0 - rnd() * 25, r = rnd();
        if (r < 0.45) {   /* 農家の母屋: 白壁・下は板張り(腰板)・窓・瓦の寄棟屋根(軒が出る)。2階建てや屋根の太陽光パネルもある */
          const w = 8 + rnd() * 3, d = 6 + rnd() * 2, two = rnd() < 0.45, h = two ? 5.6 : 3.2;
          const add = (g, m, px, py, pz, ry = 0) => { const o = new THREE.Mesh(g, m); o.position.set(px, py, pz); o.rotation.y = ry; addB(o); return o; };
          add(new THREE.BoxGeometry(w, h, d), wall, x, h / 2, z);
          add(new THREE.BoxGeometry(w + 0.06, 0.9, d + 0.06), wood, x, 0.45, z);
          for (let k = 0; k < 3; k++) add(new THREE.BoxGeometry(1.4, 0.9, 0.05), glass, x - w * 0.3 + k * w * 0.3, 1.7, z + d / 2 + 0.02);
          if (two) for (let k = 0; k < 2; k++) add(new THREE.BoxGeometry(1.2, 0.8, 0.05), glass, x - w * 0.2 + k * w * 0.4, 4.3, z + d / 2 + 0.02);
          const rf = new THREE.Mesh(new THREE.ConeGeometry(1, 1, 4), roof); rf.rotation.y = Math.PI / 4; rf.scale.set(w * 0.8, 2.2, d * 0.84); rf.position.set(x, h + 1.1, z); addB(rf);
          if (rnd() < 0.35) { const pv = new THREE.Mesh(new THREE.BoxGeometry(w * 0.55, 0.06, d * 0.3), panel); pv.position.set(x, h + 0.75, z + d * 0.2); pv.rotation.x = 0.45; addB(pv); }
        } else if (r < 0.6) {   /* 納屋・農機の倉庫(トタン屋根) */
          const b = new THREE.Mesh(new THREE.BoxGeometry(6, 3, 4), wood); b.position.set(x, 1.5, z); addB(b);
          const dr = new THREE.Mesh(new THREE.BoxGeometry(2.6, 2.2, 0.05), shed); dr.position.set(x, 1.1, z + 2.02); addB(dr);
          const rf = new THREE.Mesh(new THREE.BoxGeometry(6.6, 0.15, 4.6), shed); rf.position.set(x, 3.1, z); rf.rotation.z = 0.08; addB(rf);
        } else {
          for (let k = 0; k < 4; k++) { const tx = x + (rnd() - 0.5) * 8, tz = z + (rnd() - 0.5) * 7; if (rnd() < 0.35) conifer(tx, tz); else broadTree(tx, tz, k); }
        }
      }
    };
    village(-45, -120, 14); village(40, -135, 12); village(0, -170, 10); flushB();
    // 電柱と電線(農道に沿って)
    const pole = std('#9a9a94', 0.8), wireMat = new THREE.LineBasicMaterial({ color: lin('#2b2b2b') });
    const tops = [];
    for (let i = 0; i < 6; i++) {
      const x = -60 + i * 30, z = 6.5, m = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.17, 10, 8), pole); m.position.set(x, 5, z); scene.add(m);
      const arm = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.1, 0.1), pole); arm.position.set(x, 9.4, z); scene.add(arm); tops.push(new THREE.Vector3(x, 9.4, z));
    }
    for (const dz of [-0.06, 0, 0.06]) for (let i = 0; i < tops.length - 1; i++) {
      const a = tops[i], b = tops[i + 1], pts = [];
      for (let k = 0; k <= 16; k++) { const t = k / 16; pts.push(new THREE.Vector3(a.x + (b.x - a.x) * t, a.y - 0.6 * Math.sin(Math.PI * t), a.z + dz)); }
      scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), wireMat));
    }
    // 苗箱(手前の畦の上の苗床)
    nursery = new THREE.Group();
    const tray = std('#2a2a2a', 0.7), soil = std('#3e3226', 1);
    const nsg = hillGeometry(3, 2, 0.006, 0.05, 0.3, 0.55), seedlings = new THREE.InstancedMesh(nsg, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }), 8 * 66);
    seedlings.name = 'seedlings'; seedlings.frustumCulled = false; nursery.userData.pos = [];
    for (let i = 0; i < 8; i++) {   /* 苗箱は 60×30cm・土は約3cm。苗は箱いっぱいに密に立つ(稚苗は田植えで約12〜15cm) */
      const x = -1.25 + i * 0.64;
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.04, 0.3), tray); b.position.set(x, 0.335, 0.45); nursery.add(b);
      const s2 = new THREE.Mesh(new THREE.BoxGeometry(0.57, 0.012, 0.27), soil); s2.position.set(x, 0.36, 0.45); nursery.add(s2);
      for (let k = 0; k < 66; k++) nursery.userData.pos.push([x - 0.27 + (k % 11) * 0.054 + (rnd() - 0.5) * 0.02, 0.365, 0.45 - 0.12 + Math.floor(k / 11) * 0.048 + (rnd() - 0.5) * 0.02, rnd() * 6.3, rnd()]);
    }
    { // プール育苗: 平らにならした苗床に板で枠を作り、ブルーシートを敷いて浅く水を張る(苗箱はその上に並べる)。苗に水をやりやすく、温度もそろう【各県の育苗の手引き】
      const sheet = std('#2f6fb3', 0.6), wood = std('#9b7a52', 0.9), wat = new THREE.MeshStandardMaterial({ color: lin('#6f8a94'), roughness: 0.05, transparent: true, opacity: 0.55 });
      const L = 0.64 * 8 + 0.12, cx = -1.25 + 0.64 * 3.5;
      const bed = new THREE.Mesh(new THREE.BoxGeometry(L, 0.02, 0.42), sheet); bed.position.set(cx, 0.322, 0.45); nursery.add(bed);
      const wv = new THREE.Mesh(new THREE.PlaneGeometry(L - 0.04, 0.38), wat); wv.rotation.x = -Math.PI / 2; wv.position.set(cx, 0.345, 0.45); nursery.add(wv);
      for (const z of [0.24, 0.66]) { const w = new THREE.Mesh(new THREE.BoxGeometry(L, 0.07, 0.025), wood); w.position.set(cx, 0.345, z); nursery.add(w); }
      for (const x of [cx - L / 2, cx + L / 2]) { const w = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.07, 0.44), wood); w.position.set(x, 0.345, 0.45); nursery.add(w); } }
    nursery.add(seedlings);
    scene.add(nursery);
    // 雨
    const rp = new Float32Array(1200 * 6);
    for (let i = 0; i < 1200; i++) { const x = (rnd() - 0.5) * 18, y = rnd() * 7, z = 3 - rnd() * 16; rp.set([x, y, z, x - 0.03, y - 0.3, z], i * 6); }
    const rg = new THREE.BufferGeometry(); rg.setAttribute('position', new THREE.BufferAttribute(rp, 3));
    rain = new THREE.LineSegments(rg, new THREE.LineBasicMaterial({ color: lin('#dfe6ea'), transparent: true, opacity: 0.45 }));
    rain.visible = false; scene.add(rain);
    // シラサギ(夏の田んぼ)
    // サギ(ダイサギ・全長約90cm): 白くほっそりした体、S字に曲がる長い首、黄色い長いくちばし、黒く長い脚。水の中をそろそろ歩いて、えものをねらう
    heron = new THREE.Group();
    { const white = std('#f6f6f1', 0.75), beakM = std('#e3b62e', 0.45), legM = std('#1d1d1d', 0.6);
      const body = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), white); body.scale.set(0.09, 0.085, 0.2); body.position.set(0, 0.56, -0.02); body.rotation.x = 0.35; heron.add(body);
      const tail = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.2, 8), white); tail.position.set(0, 0.5, -0.22); tail.rotation.x = -1.9; heron.add(tail);
      const neckCurve = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0.6, 0.14), new THREE.Vector3(0, 0.7, 0.13), new THREE.Vector3(0, 0.79, 0.2), new THREE.Vector3(0, 0.88, 0.17), new THREE.Vector3(0, 0.95, 0.2)]);   // S字の首
      heron.add(new THREE.Mesh(new THREE.TubeGeometry(neckCurve, 16, 0.022, 8, false), white));
      const hd = new THREE.Group(); hd.name = 'head'; hd.position.set(0, 0.96, 0.21); heron.add(hd);
      const head = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 10), white); head.scale.set(0.03, 0.032, 0.045); hd.add(head);
      const bk = new THREE.Mesh(new THREE.ConeGeometry(0.011, 0.13, 6), beakM); bk.rotation.x = Math.PI / 2 + 0.15; bk.position.set(0, -0.008, 0.1); hd.add(bk);
      for (const sx of [-1, 1]) { const lg = new THREE.Group(); lg.name = sx < 0 ? 'legL' : 'legR'; lg.position.set(sx * 0.035, 0.5, 0.01); heron.add(lg);
        const up = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.006, 0.26, 5), legM); up.position.y = -0.13; lg.add(up); const lo = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.005, 0.26, 5), legM); lo.position.y = -0.37; lg.add(lo);
        for (const a of [-0.5, 0, 0.5]) { const toe = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.07, 3), legM); toe.rotation.set(Math.PI / 2, 0, a); toe.position.set(Math.sin(a) * 0.03, -0.5, 0.03); lg.add(toe); } } }
    heron.position.set(2.6, 0, -6.5); heron.rotation.y = -0.6; heron.visible = false; scene.add(heron);
    // 見回りで見つかるもの(手を打つと消える)。乱数は景色と別の列にして、家や木の並びを変えない
    const pr = mulberry(20261024), U = new THREE.SphereGeometry(1, 10, 8);
    // ヒエ(タイヌビエ): 稲より葉が幅広く明るい黄緑で、背が頭ひとつ高い。7月下旬から、赤紫がかった穂を稲の上に突き出す
    hieG = new THREE.Group();
    const hieGeo = hillGeometry(12, 3, 0.03, 0.15, 0.45, 0.55), hieMat = new THREE.MeshLambertMaterial({ color: lin('#a3c25a'), vertexColors: true, side: THREE.DoubleSide });
    const hpGeo = hiePanicleGeometry(pr), hpMat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
    for (const [x, z] of [[-1.15, -0.95], [0.75, -1.3], [-0.25, -1.85], [1.65, -0.8], [-2.05, -1.5]]) {
      const p = new THREE.Group(); p.position.set(x, 0, z); p.rotation.y = x * 2;
      const lv = new THREE.Mesh(hieGeo, hieMat); lv.name = 'leaf'; p.add(lv);
      const pn = new THREE.Mesh(hpGeo, hpMat); pn.name = 'pan'; pn.rotation.z = 0.12; p.add(pn); hieG.add(p);
    }
    hieG.visible = false; scene.add(hieG);
    // スズメ(全長約14cm): 頭は栗色、白いほおに黒い斑点、のどが黒い。穂にとまってついばみ、何羽かは飛び回る
    sparrows = new THREE.Group();
    const sBrown = std('#8a6440', 0.85), sCap = std('#6e3f24', 0.85), sBelly = std('#d3cdbf', 0.9), sWhite = std('#f1ede4', 0.9), sBlack = std('#1d1915', 0.7), sWing = std('#5e432b', 0.85);
    const ball = (m, sx, sy, sz, x, y, z, par) => { const o = new THREE.Mesh(U, m); o.scale.set(sx, sy, sz); o.position.set(x, y, z); par.add(o); return o; };
    const sparrow = () => {
      const b = new THREE.Group();
      ball(sBrown, 0.028, 0.026, 0.048, 0, 0, 0, b); ball(sBelly, 0.025, 0.021, 0.04, 0, -0.008, 0.008, b);
      const hd = new THREE.Group(); hd.position.set(0, 0.024, 0.036); hd.name = 'head'; b.add(hd);
      ball(sCap, 0.021, 0.02, 0.022, 0, 0, 0, hd);
      for (const sx of [-1, 1]) { ball(sWhite, 0.006, 0.011, 0.013, sx * 0.016, -0.004, 0.006, hd); ball(sBlack, 0.002, 0.004, 0.004, sx * 0.0215, -0.003, 0.004, hd); ball(sBlack, 0.003, 0.003, 0.003, sx * 0.015, 0.005, 0.014, hd); }
      ball(sBlack, 0.01, 0.01, 0.007, 0, -0.016, 0.013, hd);
      const bk = new THREE.Mesh(new THREE.ConeGeometry(0.006, 0.014, 6), sBlack); bk.rotation.x = Math.PI / 2; bk.position.set(0, -0.003, 0.026); hd.add(bk);
      for (const sx of [-1, 1]) { const w = new THREE.Group(); w.position.set(sx * 0.022, 0.01, 0.012); w.name = sx < 0 ? 'wl' : 'wr'; b.add(w); ball(sWing, 0.006, 0.02, 0.042, sx * 0.004, -0.006, -0.02, w); ball(sWhite, 0.0065, 0.0025, 0.018, sx * 0.004, 0.004, -0.008, w); }
      const tl = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.004, 0.05), sWing); tl.position.set(0, 0.004, -0.06); tl.rotation.x = -0.25; b.add(tl);
      return b;
    };
    for (const [x, z, r] of [[-0.8, -0.9, 0.4], [-0.45, -1.25, 2.2], [0.6, -1.0, -0.8], [1.2, -1.6, 1.6], [0.1, -1.9, 3.0], [0.4, -1.4, 0], [-0.2, -1.6, 0]]) {
      const b = sparrow(); b.position.set(x, 0, z); b.rotation.y = r; b.scale.setScalar(1.15); b.userData.y0 = 0;
      if (sparrows.children.length >= 5) b.userData.fly = { cx: x, cz: z, r: 0.9 + 0.5 * (sparrows.children.length - 5), ph: r * 3 + sparrows.children.length * 2 };
      sparrows.add(b);
    }
    sparrows.visible = false; scene.add(sparrows);
    // スズメの食べあと: 籾をむいて中身だけ食べるので、むいた籾殻が株元の水面や土に散らばる(籾殻は白っぽい黄土色・長さ7mm)【農研機構 鳥獣害痕跡図鑑】
    husks = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.004, 0.008), new THREE.MeshLambertMaterial({ color: lin('#d8c48a'), side: THREE.DoubleSide }), 600);
    { const r9 = mulberry(9191), MA = new THREE.Matrix4(), QA = new THREE.Quaternion(), EA = new THREE.Euler(), PA = new THREE.Vector3(), SA = new THREE.Vector3(1, 1, 1);
      for (let i = 0; i < 600; i++) { const c = [[-0.8, -0.9], [-0.45, -1.25], [0.6, -1.0], [1.2, -1.6], [0.1, -1.9]][i % 5]; PA.set(c[0] + (r9() - 0.5) * 0.35, 0.004, c[1] + (r9() - 0.5) * 0.35); EA.set(-Math.PI / 2 + (r9() - 0.5) * 0.6, r9() * 6.3, 0); QA.setFromEuler(EA); MA.compose(PA, QA, SA); husks.setMatrixAt(i, MA); } }
    husks.visible = false; husks.frustumCulled = false; scene.add(husks);
    // 台風のあと(5日ほど): ちぎれた葉や小枝、畦の草くずが水面に浮き、畦ぎわに吹きよせられる
    debris = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.012, 0.09), new THREE.MeshLambertMaterial({ color: 0xffffff, side: THREE.DoubleSide }), 400);
    { const rB = mulberry(1212), MC = new THREE.Matrix4(), QC = new THREE.Quaternion(), EC = new THREE.Euler(), PC = new THREE.Vector3(), SC = new THREE.Vector3(1, 1, 1);
      for (let i = 0; i < 400; i++) { const nearEdge = i < 250; PC.set((rB() - 0.5) * (FIELD_W * 2 - 0.4), 0.003, nearEdge ? -0.2 - rB() * 0.5 : -0.3 - rB() * 7); EC.set(-Math.PI / 2, 0, rB() * 6.3); QC.setFromEuler(EC); SC.setScalar(0.7 + rB() * 0.8); MC.compose(PC, QC, SC); debris.setMatrixAt(i, MC); debris.setColorAt(i, rB() < 0.6 ? hsl(85 + rB() * 20, 0.4, 0.35) : hsl(35, 0.35, 0.4)); } }
    debris.visible = false; debris.frustumCulled = false; scene.add(debris);
    // 見回りで見つけた生き物を、その旬の田んぼに: オタマジャクシ(黒い頭としっぽ)・アマガエル(緑・畦ぎわの稲の葉に)・アメンボ(水面に足を広げる)
    { const rD = mulberry(1414), MD = new THREE.Matrix4(), QD = new THREE.Quaternion(), ED = new THREE.Euler(), PD = new THREE.Vector3(), SD = new THREE.Vector3();
      const tadG = new THREE.SphereGeometry(1, 6, 4); tadG.scale(1, 0.5, 1.6); const tad = new THREE.InstancedMesh(tadG, std('#2a2620', 0.5), 60);
      for (let i = 0; i < 60; i++) { PD.set(-1.2 + rD() * 2.4, 0, -0.25 - rD() * 0.6); ED.set(0, rD() * 6.3, 0); QD.setFromEuler(ED); SD.set(0.009, 0.009, 0.009); MD.compose(PD, QD, SD); tad.setMatrixAt(i, MD); }
      const frog = new THREE.Group(), fm = std('#6cc04a', 0.5), fe = std('#111', 0.4);
      for (const [x, z, r] of [[-0.6, -0.4, 0.5], [0.5, -0.5, 2.6], [1.3, -0.35, -0.7]]) { const g = new THREE.Group(); const b = new THREE.Mesh(U, fm); b.scale.set(0.011, 0.008, 0.016); g.add(b); for (const sx of [-1, 1]) { const e = new THREE.Mesh(U, fe); e.scale.setScalar(0.003); e.position.set(sx * 0.006, 0.006, 0.01); g.add(e); const lg = new THREE.Mesh(U, fm); lg.scale.set(0.004, 0.003, 0.01); lg.position.set(sx * 0.01, -0.004, -0.008); g.add(lg); } g.position.set(x, 0.12, z); g.rotation.y = r; frog.add(g); }
      const sk = new THREE.Group(), lm = new THREE.LineBasicMaterial({ color: lin('#1a1a1a') });
      for (let i = 0; i < 6; i++) { const g = new THREE.Group(), body = new THREE.Mesh(U, std('#222', 0.6)); body.scale.set(0.002, 0.002, 0.009); g.add(body); const pts = []; for (const [ax, az] of [[0.02, 0.012], [-0.02, 0.012], [0.024, -0.012], [-0.024, -0.012]]) pts.push(new THREE.Vector3(0, 0, 0), new THREE.Vector3(ax, -0.002, az)); g.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), lm)); g.position.set(-1 + rD() * 2, 0.002, -0.3 - rD() * 0.7); g.rotation.y = rD() * 6.3; sk.add(g); }
      // 季節の生き物(見回らなくても、季節と水があればいる・文字を減らして3Dで見せる 店主10/28): アメリカザリガニ(水の中をのそのそ)・ウシガエル(水面から目と頭だけ)・ヒメゲンゴロウ(水面近くを泳ぐ黒い小判形)
      const crw = new THREE.Group(), cA = std('#7e2414', 0.45), cB = std('#561a10', 0.45);
      for (const [x, z, r] of [[0.85, -0.4, 0.6], [-1.4, -0.55, 2.5]]) { const g = new THREE.Group(), b = new THREE.Mesh(U, cA); b.scale.set(0.014, 0.01, 0.024); g.add(b);
        for (let k = 0; k < 3; k++) { const t = new THREE.Mesh(U, k % 2 ? cB : cA); t.scale.set(0.011 - k * 0.002, 0.007, 0.007); t.position.set(0, -0.001, -0.022 - k * 0.011); g.add(t); }
        for (const sx of [-1, 1]) {
          const c = new THREE.Mesh(flatPart([[-0.003, -0.016], [-0.006, -0.005], [-0.005, 0.01], [-0.002, 0.017], [-0.001, 0.006], [0.002, 0.003], [0.004, 0.015], [0.006, 0.01], [0.006, -0.005], [0.003, -0.016]], 0.006), cA);
          c.position.set(sx * 0.011, 0.003, 0.034); c.rotation.y = sx * 0.4; c.name = 'claw'; g.add(c);
        }
        const legs = modelParts();
        for (const sx of [-1, 1]) for (let k = 0; k < 4; k++) {
          const z0 = 0.012 - k * 0.008, bend = [sx * 0.023, -0.003, z0 + 0.006 - k * 0.003];
          legs.rod([sx * 0.009, -0.003, z0], bend, 0.0013, '#561a10', 4);
          legs.rod(bend, [sx * 0.029, -0.01, z0 + 0.01 - k * 0.006], 0.0009, '#7e2414', 4);
        }
        legs.add(flatPart([[-0.004, -0.047], [-0.014, -0.057], [-0.01, -0.062], [0, -0.064], [0.01, -0.062], [0.014, -0.057], [0.004, -0.047]], 0.003), '#561a10', 0, -0.002, 0);
        legs.finish(g);
        g.position.set(x, 0, z); g.rotation.y = r; g.scale.setScalar(1.35); g.userData = { x, z, r }; crw.add(g); }
      const bull = new THREE.Group(), bm = std('#5e6b33', 0.45), bw = std('#e8e2c0', 0.5);
      for (const [x, z] of [[1.45, -0.42]]) { const g = new THREE.Group(), hd = new THREE.Mesh(U, bm); hd.scale.set(0.03, 0.012, 0.034); g.add(hd);
        for (const sx of [-1, 1]) { const e = new THREE.Mesh(U, bm); e.scale.setScalar(0.009); e.position.set(sx * 0.014, 0.008, 0.012); g.add(e); const pu = new THREE.Mesh(U, fe); pu.scale.setScalar(0.0045); pu.position.set(sx * 0.016, 0.012, 0.016); g.add(pu); const ty = new THREE.Mesh(U, bw); ty.scale.set(0.006, 0.006, 0.002); ty.position.set(sx * 0.026, 0.002, 0.0); ty.rotation.y = sx * 1.2; g.add(ty); }
        g.position.set(x, 0, z); g.rotation.y = 0.3; bull.add(g); }
      const gen = new THREE.Group(), gm = std('#1f2418', 0.25);
      for (let i = 0; i < 4; i++) { const g = new THREE.Mesh(U, gm); g.scale.set(0.006, 0.003, 0.009); const x = -0.9 + i * 0.6 + rD() * 0.2, z = -0.3 - rD() * 0.5; g.position.set(x, 0, z); g.userData = { x, z }; gen.add(g); }
      lifeG.cray = crw; lifeG.bull = bull; lifeG.gen = gen;
      { /* ドジョウ(店主 10/29「ドジョウが出てきてこんにちは」をメインイベントに): 水面から顔を出す。茶色の細長い体・背に小さな斑点・口ひげ */
        const dj = new THREE.Group(), body = new THREE.Group(); body.name = 'body';
        const pos = [], col = [], uv = [], idx = [], back = lin('#75634a'), belly = lin('#c9bb93');
        /* 吻から尾までつながる十六節の胴 */
        const radii = [0.0018, 0.0057, 0.0067, 0.007, 0.0069, 0.0067, 0.0064, 0.006, 0.0056, 0.0051, 0.0046, 0.004, 0.0034, 0.0028, 0.0022, 0.0015, 0.0007];
        for (let k = 0; k <= 16; k++) for (let j = 0; j <= 8; j++) {
          const t = k / 16, a = j * Math.PI / 4, r = radii[k], c = back.clone().lerp(belly, Math.max(0, -Math.cos(a)));
          pos.push(Math.sin(a) * r, Math.cos(a) * r * 0.9, 0.02 - 0.23 * t); col.push(c.r, c.g, c.b); uv.push(t, j / 8);
          if (k < 16 && j < 8) { const n = k * 9 + j; idx.push(n, n + 1, n + 9, n + 1, n + 10, n + 9); }
        }
        for (const k of [0, 16]) { const n = pos.length / 3, c = k ? back : belly; pos.push(0, 0, 0.02 - 0.23 * k / 16); col.push(c.r, c.g, c.b); uv.push(k / 16, 0.5); for (let j = 0; j < 8; j++) { if (k) idx.push(n, k * 9 + j, k * 9 + j + 1); else idx.push(n, j + 1, j); } }
        const mottles = canvasTex(256, 64, (g, w, h) => {
          const r = mulberry(20261031); g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h); g.fillStyle = 'rgba(65,51,32,0.35)';
          for (let k = 0; k < 130; k++) { const x = 20 + r() * (w - 24), y = r() * h; if (y > h * 0.32 && y < h * 0.68) continue; g.beginPath(); g.ellipse(x, y, 0.5 + r() * 2, 0.5 + r(), 0, 0, Math.PI * 2); g.fill(); }
        }, null);
        const skinGeo = geo(pos, col, uv, idx), skinN = skinGeo.attributes.normal;
        for (let k = 0; k <= 16; k++) { const a = k * 9, b = a + 8, n = new THREE.Vector3().fromBufferAttribute(skinN, a).add(new THREE.Vector3().fromBufferAttribute(skinN, b)).normalize(); skinN.setXYZ(a, n.x, n.y, n.z); skinN.setXYZ(b, n.x, n.y, n.z); }
        body.add(new THREE.Mesh(skinGeo, std('#ffffff', 0.5, { map: mottles, vertexColors: true })));
        const details = modelParts();
        for (const sx of [-1, 1]) {
          const e = new THREE.Mesh(U, std('#141414', 0.2)); e.scale.setScalar(0.001); e.position.set(sx * 0.0038, 0.0025, 0.012); body.add(e);
          for (let k = 0; k < 5; k++) {
            const a = [sx * (0.0012 + k * 0.00055), -0.0017 - k * 0.00025, 0.019 - k * 0.0015];
            const angle = 0.15 + k * 0.38, length = 0.004 + k * 0.00075;
            details.rod(a, [a[0] + sx * Math.sin(angle) * length, a[1] - 0.001, a[2] + Math.cos(angle) * length], 0.00022, '#75634a', 4);
          }
        }
        details.ell(0.0007, 0.0048, 0.008, '#75634a', 0, 0, -0.207);
        for (const sx of [-1, 1]) details.add(flatPart([[0, 0], [sx * 0.007, -0.007], [sx * 0.003, -0.012]], 0.0004), '#a09472', sx * 0.004, -0.003, -0.012);
        details.finish(body, 0.55);
        dj.add(body); dj.position.set(1.15, 0, -0.32); dj.rotation.y = 1.25; dj.scale.setScalar(2.6); lifeG.dojo = dj;   /* 横向き: 細長い体と口ひげが見える */
        const cv = document.createElement('canvas'); cv.width = cv.height = 128; const g2 = cv.getContext('2d'); g2.fillStyle = '#fffdf6'; g2.strokeStyle = '#7aa95c'; g2.lineWidth = 6; g2.beginPath(); g2.arc(64, 56, 46, 0, 7); g2.fill(); g2.stroke(); g2.beginPath(); g2.moveTo(52, 98); g2.lineTo(64, 124); g2.lineTo(76, 98); g2.fill(); g2.font = '56px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif'; g2.textAlign = 'center'; g2.textBaseline = 'middle'; g2.fillText('👋', 64, 60);
        const tx = new THREE.CanvasTexture(cv); if ('colorSpace' in tx) tx.colorSpace = THREE.SRGBColorSpace; const hb = new THREE.Sprite(new THREE.SpriteMaterial({ map: tx, transparent: true, depthTest: false, fog: false })); hb.scale.set(0.05, 0.05, 1); hb.position.set(0.0, 0.06, 0.02); hb.name = 'hello'; hb.renderOrder = 20; hb.visible = false; dj.add(hb); }
      lifeG.tad = tad; lifeG.frog = frog; lifeG.strider = sk; for (const k in lifeG) { lifeG[k].visible = false; lifeG[k].frustumCulled = false; scene.add(lifeG[k]); } }
    // 雨の日の水面: 雨つぶが落ちた所から輪がひろがって消える(手前の水面に120個・順番に)
    { const tex = canvasTex(64, 64, (g, w, h) => { g.clearRect(0, 0, w, h); g.strokeStyle = 'rgba(255,255,255,0.75)'; g.lineWidth = 2; g.beginPath(); g.arc(w / 2, h / 2, w / 2 - 3, 0, 7); g.stroke(); g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 1.5; g.beginPath(); g.arc(w / 2, h / 2, w / 2 - 12, 0, 7); g.stroke(); }, null, false);
      ripples = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0.55 }), 120);
      const rC = mulberry(1313); ripples.userData.p = Array.from({ length: 120 }, () => [(rC() - 0.5) * 10, -0.3 - rC() * 5.5, rC()]);
      ripples.visible = false; ripples.frustumCulled = false; scene.add(ripples); }
    // 畦の穴(ザリガニの穴): 田の水が畦の中を抜けて、外側の斜面から流れ出る。まわりの土は黒く濡れる。田の側の水面には小さな渦
    leakHole = new THREE.Group();
    const LX = -2.6, nrm = new THREE.Vector3(0, 0.3, 0.32).normalize(), onSlope = (y, dx = 0) => new THREE.Vector3(LX + dx, y, 0.7 + (0.32 - y) / 0.32 * 0.3).addScaledVector(nrm, 0.003);   // 手前の畦の外側の斜面(z 0.7→1.0・高さ0.32→0)
    const flat = (m, sx, sy, at, look) => { const o = new THREE.Mesh(new THREE.CircleGeometry(1, 24), m); o.scale.set(sx, sy, 1); o.position.copy(at); o.lookAt(at.clone().add(look)); leakHole.add(o); return o; };
    const wetM = new THREE.MeshStandardMaterial({ color: lin('#2a2219'), roughness: 0.75, envMapIntensity: 0.25, alphaMap: canvasTex(64, 64, (g, w, h) => { g.fillStyle = '#000'; g.fillRect(0, 0, w, h); for (let k = 0; k < 7; k++) { const x = w / 2 + (pr() - 0.5) * 18, y = h / 2 + (pr() - 0.5) * 22, gr = g.createRadialGradient(x, y, 0, x, y, 14 + pr() * 10); gr.addColorStop(0, '#fff'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); } }, null, false), transparent: true, opacity: 0.9, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 });
    flat(wetM, 0.11, 0.2, onSlope(0.15), nrm); flat(wetM, 0.16, 0.12, new THREE.Vector3(LX, 0.323, 0.6), new THREE.Vector3(0, 1, 0));
    flat(std('#0b0907', 1), 0.022, 0.016, onSlope(0.27).addScaledVector(nrm, 0.001), nrm);
    const streamTex = waterNormal.clone(); streamTex.needsUpdate = true; streamTex.repeat.set(6, 1);
    const streamM = new THREE.MeshStandardMaterial({ color: lin('#9aa19a'), roughness: 0.04, transparent: true, opacity: 0.8, normalMap: streamTex, normalScale: new THREE.Vector2(0.6, 0.6), envMapIntensity: 1.3 });
    const sc = new THREE.CatmullRomCurve3([onSlope(0.265), onSlope(0.2, 0.012), onSlope(0.11, -0.01), onSlope(0.02, 0.006), new THREE.Vector3(LX, 0.012, 1.03)]);
    const stream = new THREE.Mesh(new THREE.TubeGeometry(sc, 24, 0.008, 6, false), streamM); stream.scale.set(1, 1, 1); leakHole.add(stream); leakHole.userData.stream = streamTex;
    flat(streamM, 0.1, 0.03, new THREE.Vector3(LX, 0.014, 1.025), new THREE.Vector3(0, 1, 0));
    const whirl = flat(new THREE.MeshBasicMaterial({ map: canvasTex(128, 128, (g, w, h) => { g.translate(w / 2, h / 2); g.strokeStyle = 'rgba(255,255,255,0.55)'; g.lineWidth = 2.2; for (let k = 0; k < 3; k++) { g.beginPath(); for (let a = 0; a < 9; a += 0.1) { const rr = 4 + a * 6, x = Math.cos(a + k * 2.1) * rr, y = Math.sin(a + k * 2.1) * rr; a ? g.lineTo(x, y) : g.moveTo(x, y); } g.stroke(); } }, null, false), transparent: true, depthWrite: false }), 0.14, 0.14, new THREE.Vector3(LX, 0.05, -0.16), new THREE.Vector3(0, 1, 0));
    whirl.name = 'whirl';
    // アメリカザリガニ(約10cm): 穴を掘った張本人。畦の上をうろうろ
    const cray = new THREE.Group(), cr = std('#9a2c1a', 0.5), crd = std('#6e1d12', 0.5);
    ball(cr, 0.016, 0.012, 0.028, 0, 0.012, 0.012, cray);
    for (let k = 0; k < 4; k++) ball(k % 2 ? crd : cr, 0.013 - k * 0.0018, 0.008, 0.008, 0, 0.01 - k * 0.001, -0.02 - k * 0.012, cray);
    ball(crd, 0.014, 0.003, 0.008, 0, 0.006, -0.07, cray);
    for (const sx of [-1, 1]) {
      const arm = new THREE.Group(); arm.position.set(sx * 0.012, 0.012, 0.035); arm.rotation.y = sx * 0.5; arm.name = 'claw'; cray.add(arm);
      ball(cr, 0.004, 0.004, 0.016, 0, 0, 0.014, arm); ball(cr, 0.009, 0.005, 0.02, 0, 0, 0.042, arm); ball(crd, 0.003, 0.003, 0.014, sx * -0.004, 0, 0.066, arm);
      const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.0007, 0.0007, 0.09, 3), crd); ant.rotation.x = Math.PI / 2 - 0.25; ant.rotation.z = sx * 0.3; ant.position.set(sx * 0.012, 0.03, 0.08); cray.add(ant);
      for (let k = 0; k < 3; k++) { const lg = new THREE.Mesh(new THREE.CylinderGeometry(0.0012, 0.0012, 0.03, 3), crd); lg.rotation.z = sx * 1.1; lg.position.set(sx * 0.02, 0.006, 0.01 - k * 0.012); cray.add(lg); }
    }
    cray.position.set(LX + 0.2, 0.322, 0.5); cray.rotation.y = 2.4; cray.scale.setScalar(1.1); leakHole.add(cray); leakHole.userData.cray = cray;
    leakHole.visible = false; scene.add(leakHole);
    // ナガエツルノゲイトウ: 中空の茎が水面を這って厚いマットになる。立ち上がった茎に、向かい合ったつやのある細長い葉と、長い柄の先の白い丸い花(約1.5cm)。水口のわきから田に入りこみ、見のがすほど広がる
    hillGeometry(10, 3, 0.02, 0.6, 0.95, 0.5).dispose();   // 前の版と同じだけ景色の乱数を進める
    nagaeG = new THREE.Group();
    const ngd = nagaeGeometry(pr);
    const ngLeaf = new THREE.Mesh(ngd.leaf, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, side: THREE.DoubleSide }));
    const ngStem = new THREE.Mesh(ngd.stem, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
    const ngFl = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.0075, 1), std('#f5f4ec', 0.7), ngd.flowers.length);
    { const M = new THREE.Matrix4(); ngd.flowers.forEach((v, i) => { M.makeTranslation(v.x, v.y, v.z); ngFl.setMatrixAt(i, M); }); }
    ngLeaf.frustumCulled = ngStem.frustumCulled = ngFl.frustumCulled = false;
    nagaeG.add(ngStem, ngLeaf, ngFl); nagaeG.userData = { leaf: ngLeaf, stem: ngStem, fl: ngFl, cut: ngd.cut };
    nagaeG.visible = false; scene.add(nagaeG);
    // ジャンボタニシ(殻の高さ3〜5cm・茶色にこげ茶の帯): 田植え直後の浅い水面のきわに。ピンクの卵のかたまり(長さ2〜5cm)は稲の茎の水面より上に
    snailG = new THREE.Group();
    const shellGeo = new THREE.SphereGeometry(1, 14, 10); { const pa = shellGeo.attributes.position, col = []; for (let i = 0; i < pa.count; i++) { const y = pa.getY(i), band = 0.5 + 0.5 * Math.sin(y * 9 + Math.atan2(pa.getZ(i), pa.getX(i)) * 1.5); const c = lin('#6b5434').lerp(lin('#3a2b19'), band * 0.7); col.push(c.r, c.g, c.b); } shellGeo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); }
    const shellM = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55 }), footM = std('#8c8577', 0.6);
    for (let i = 0; i < 7; i++) {
      const g = new THREE.Group(), sh = new THREE.Mesh(shellGeo, shellM); sh.scale.set(0.02, 0.022, 0.018); sh.position.y = 0.012; sh.rotation.z = 0.5; g.add(sh);
      const ap = new THREE.Mesh(shellGeo, shellM); ap.scale.set(0.011, 0.012, 0.01); ap.position.set(0.012, 0.03, 0); g.add(ap);   // 殻の先(らせんの頂)
      const ft = new THREE.Mesh(U, footM); ft.scale.set(0.026, 0.006, 0.014); ft.position.set(-0.006, 0, 0); g.add(ft);
      g.position.set(-0.7 + i * 0.32 + pr() * 0.1, 0, -0.18 - pr() * 0.4); g.rotation.y = pr() * 6.3; g.scale.setScalar(0.9 + pr() * 0.5); snailG.add(g);
    }
    snailG.visible = false; scene.add(snailG);
    eggG = new THREE.Group();
    const eggM = new THREE.MeshStandardMaterial({ color: lin('#ff5c9d'), roughness: 0.5, emissive: lin('#3a0a1c') }), eggGeo = new THREE.SphereGeometry(0.0032, 6, 4);
    for (let k = 0; k < 6; k++) {
      const n = 140, im = new THREE.InstancedMesh(eggGeo, eggM, n), M = new THREE.Matrix4(), len = 0.03 + pr() * 0.03;
      for (let i = 0; i < n; i++) { const a = pr() * 6.3, t = pr(); M.makeTranslation(Math.cos(a) * 0.006 * (1 - Math.abs(t - 0.5)), t * len, Math.sin(a) * 0.006 * (1 - Math.abs(t - 0.5))); im.setMatrixAt(i, M); }
      const x0 = -1.15 + k * 0.45, x = -FIELD_W + 0.2 + 0.3 * Math.round((x0 + FIELD_W - 0.2) / 0.3) + 0.012, g = new THREE.Group(); g.add(im); g.position.set(x, 0.06 + pr() * 0.08, -0.45 + 0.012); eggG.add(g);   /* 手前の列の株の茎にくっつける */
    }
    eggG.visible = false; scene.add(eggG);
    // 人と機械: 見回った旬は畦に農家さん(麦わら帽子・首にタオル・青い作業着・長ぐつ)。代かき・田植えの旬はトラクター・田植え機が田の中に
    const cyl = (r1, r2, h, m, x, y, z, par, rx = 0, rz = 0) => { const o = new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, h, 10), m); o.position.set(x, y, z); o.rotation.set(rx, 0, rz); par.add(o); return o; };
    const box = (w, h, d, m, x, y, z, par) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); par.add(o); return o; };
    farmer = new THREE.Group();
    { const boot = std('#1c1c1c', 0.5), pants = std('#2f3d55', 0.9), shirt = std('#3f6fa6', 0.85), skin = std('#c9936a', 0.8), towel = std('#f2f0e8', 0.9), straw = std('#e3c271', 0.9), band = std('#a8443a', 0.8);
      for (const sx of [-1, 1]) { cyl(0.05, 0.055, 0.3, boot, sx * 0.08, 0.15, 0, farmer); cyl(0.06, 0.055, 0.5, pants, sx * 0.08, 0.55, 0, farmer); cyl(0.035, 0.04, 0.5, shirt, sx * 0.21, 1.12, 0.03, farmer, 0.25, sx * 0.18); cyl(0.03, 0.03, 0.08, skin, sx * 0.25, 0.86, 0.1, farmer); }
      cyl(0.15, 0.13, 0.55, shirt, 0, 1.1, 0, farmer); cyl(0.05, 0.05, 0.08, skin, 0, 1.42, 0, farmer);
      const tw = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.03, 8, 16), towel); tw.rotation.x = Math.PI / 2; tw.position.y = 1.4; farmer.add(tw);
      const hd = new THREE.Mesh(U, skin); hd.scale.set(0.1, 0.115, 0.105); hd.position.y = 1.55; farmer.add(hd);
      cyl(0.26, 0.26, 0.012, straw, 0, 1.62, 0, farmer); const dome = new THREE.Mesh(U, straw); dome.scale.set(0.12, 0.08, 0.12); dome.position.y = 1.65; farmer.add(dome); cyl(0.118, 0.118, 0.025, band, 0, 1.64, 0, farmer); }
    // すくい取りの網(イネカメムシ): 長い柄の先に、直径36cmの白い網。見回りでカメムシを見つけた旬は、農家さんが稲の上を左右にふる【愛知県病害虫防除所の調査=20回すくい取り】
    { const net = new THREE.Group(); net.name = 'net'; net.position.set(0.22, 1.3, 0.1); net.userData.base = -1.0; farmer.add(net);   /* 体の前(カメラ側)へ網をのばす */
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 1.2, 6), std('#c9b07a', 0.7)); pole.rotation.z = -1.5; pole.position.set(0.55, -0.03, 0); net.add(pole);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.01, 6, 20), std('#d8d8d0', 0.6)); ring.position.set(1.12, -0.06, 0); ring.rotation.y = Math.PI / 2; net.add(ring);
      const bag = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.42, 16, 1, true), new THREE.MeshLambertMaterial({ color: lin('#f2f2ec'), transparent: true, opacity: 0.85, side: THREE.DoubleSide })); bag.rotation.z = Math.PI / 2; bag.position.set(1.33, -0.06, 0); net.add(bag);
      net.visible = false; }
    farmer.position.set(2.4, -0.12, -3.6); farmer.rotation.y = -0.5; farmer.scale.setScalar(0.95);   /* 田に入って稲を見ている(長ぐつが泥に少し沈む) */ farmer.visible = false; scene.add(farmer);
    // ちびの農家さん(店主 10/28「上の窓に素朴なかわいい農家キャラクターが米作りしている姿が滑らかに動くように」): 丸い頭・点の目・ほっぺ・麦わら帽子。季節の作業を、ゆっくりなめらかに(見た目だけ・乱数なし)
    chibi = new THREE.Group();
    { const B = new THREE.SphereGeometry(1, 14, 10), soft = (c) => std(c, 1), M = (m, sx, sy, sz, x, y, z, par) => { const o = new THREE.Mesh(B, m); o.scale.set(sx, sy, sz); o.position.set(x, y, z); par.add(o); return o; };
      const skin = soft('#f6dcc4'), cloth = soft('#4f6f9c'), cloth2 = soft('#3e5a82'), boot = soft('#34483f'), strawM = soft('#ebcf86'), rib = soft('#c84a3c'), towelM = soft('#fbfaf4'), eyeM = std('#1d1a18', 0.35), cheek = new THREE.MeshBasicMaterial({ color: lin('#f4a5a0'), transparent: true, opacity: 0.75 });
      const body = new THREE.Group(); body.name = 'body'; chibi.add(body);
      for (const sx of [-1, 1]) { const lg = new THREE.Group(); lg.name = sx < 0 ? 'legL' : 'legR'; lg.position.set(sx * 0.055, 0.12, 0); chibi.add(lg); M(cloth2, 0.045, 0.06, 0.045, 0, -0.03, 0, lg); M(boot, 0.05, 0.05, 0.06, 0, -0.09, 0.012, lg); }
      M(cloth, 0.135, 0.14, 0.12, 0, 0.24, 0, body);
      const tw = new THREE.Mesh(new THREE.TorusGeometry(0.072, 0.024, 8, 18), towelM); tw.rotation.x = Math.PI / 2; tw.position.y = 0.34; body.add(tw);
      const head = new THREE.Group(); head.name = 'head'; head.position.y = 0.46; body.add(head);
      M(skin, 0.15, 0.135, 0.135, 0, 0, 0, head);
      for (const sx of [-1, 1]) { const e = M(eyeM, 0.013, 0.017, 0.008, sx * 0.05, 0.01, 0.128, head); e.name = 'eye'; const ck = new THREE.Mesh(new THREE.CircleGeometry(0.022, 16), cheek); ck.position.set(sx * 0.085, -0.03, 0.118); ck.rotation.y = sx * 0.55; head.add(ck); }
      const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.016, 0.0035, 4, 12, Math.PI), eyeM); mouth.rotation.z = Math.PI; mouth.position.set(0, -0.022, 0.133); head.add(mouth);
      const hat = new THREE.Group(); hat.name = 'hat'; hat.position.y = 0.085; head.add(hat);
      { const weave = canvasTex(128, 128, (g, w, h) => {
          g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h); g.lineWidth = 1; g.strokeStyle = 'rgba(133,106,53,0.20)';
          for (let y = 0; y < h; y += 8) for (let x = -8; x < w; x += 8) { const offset = (y / 8 % 2) * 4; g.beginPath(); g.moveTo(x + offset, y); g.lineTo(x + offset + 5, y + 3); g.moveTo(x + offset + 5, y + 3); g.lineTo(x + offset + 7, y); g.stroke(); }
        }, [3, 2]); strawM.map = weave;
        const brimG = new THREE.CylinderGeometry(0.235, 0.235, 0.01, 22), p = brimG.attributes.position;
        for (let k = 0; k < p.count; k++) { const x = p.getX(k), z = p.getZ(k), a = Math.atan2(z, x), radius = Math.hypot(x, z); p.setY(k, p.getY(k) + Math.pow(radius / 0.235, 2) * (0.004 * Math.cos(2 * a) + 0.003 * Math.sin(3 * a))); }
        brimG.computeVertexNormals(); const brim = new THREE.Mesh(brimG, strawM); hat.add(brim);
        M(strawM, 0.125, 0.095, 0.12, 0, 0.035, 0, hat); const band = new THREE.Mesh(new THREE.CylinderGeometry(0.126, 0.123, 0.024, 20), rib); band.position.y = 0.02; hat.add(band);
      }
      /* 耳は頭、タオルの端は胴と一緒に動く */
      const ears = modelParts(), towelEnds = modelParts();
      for (const sx of [-1, 1]) { ears.ell(0.018, 0.024, 0.012, '#f6dcc4', sx * 0.146, -0.006, 0.002); towelEnds.ell(0.018, 0.055, 0.008, '#fbfaf4', sx * 0.045, 0.292, 0.105); }
      ears.finish(head, 1); towelEnds.finish(body, 1);
      for (const sx of [-1, 1]) { const am = new THREE.Group(); am.name = sx < 0 ? 'armL' : 'armR'; am.position.set(sx * 0.14, 0.3, 0); body.add(am); M(cloth, 0.035, 0.08, 0.035, 0, -0.06, 0, am); M(skin, 0.03, 0.03, 0.03, 0, -0.14, 0, am).name = 'hand'; }
      const T = (n) => { const g = new THREE.Group(); g.name = n; g.visible = false; return g; };
      const armR = body.getObjectByName('armR'), armL = body.getObjectByName('armL');
      { const g = T('can'); armR.add(g); g.position.set(0, -0.15, 0.04); const c = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.045, 0.07, 12), soft('#6fa8c9')); g.add(c); const sp = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.01, 0.1, 6), soft('#6fa8c9')); sp.rotation.x = 1.0; sp.position.set(0, 0.01, 0.07); g.add(sp); }
      { const g = T('nae'); armR.add(g); g.position.set(0, -0.16, 0.02); for (let k = 0; k < 5; k++) { const b = new THREE.Mesh(new THREE.CylinderGeometry(0.002, 0.003, 0.09, 3), soft('#7fbf4d')); b.position.set((k - 2) * 0.004, -0.04, 0); b.rotation.z = (k - 2) * 0.12; g.add(b); } M(soft('#5b4630'), 0.012, 0.01, 0.012, 0, -0.085, 0, g); }
      { const g = T('kama'); armR.add(g); g.position.set(0, -0.15, 0.02); const hd = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.12, 6), soft('#b08a55')); hd.rotation.x = Math.PI / 2; hd.position.z = 0.05; g.add(hd); const bl = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.005, 4, 10, Math.PI * 0.8), std('#c7ccd1', 0.35)); bl.position.set(0, 0.03, 0.11); bl.rotation.y = Math.PI / 2; g.add(bl); }
      { const g = T('ami'); armR.add(g); g.position.set(0, -0.15, 0.02); const pl = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.42, 6), soft('#c9b07a')); pl.rotation.x = Math.PI / 2 - 0.4; pl.position.set(0, 0.08, 0.2); g.add(pl); const rg = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.005, 6, 18), soft('#e8e8e0')); rg.position.set(0, 0.17, 0.41); g.add(rg); }
      { const g = T('taba'); armL.add(g); g.position.set(0.04, -0.14, 0.06); g.scale.setScalar(1.7); for (let k = 0; k < 9; k++) { const b = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.2, 3), soft('#d9b85c')); b.position.set((k % 3 - 1) * 0.008, 0, (Math.floor(k / 3) - 1) * 0.008); b.rotation.z = (k % 3 - 1) * 0.15; g.add(b); } M(soft('#c9a24a'), 0.03, 0.035, 0.03, 0, 0.11, 0, g); }
      { const g = T('suito'); armR.add(g); g.position.set(0, -0.15, 0.03); const c = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.08, 12), soft('#7a9fb8')); g.add(c); const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.022, 0.018, 12), soft('#e7e2d2')); cap.position.y = 0.048; g.add(cap); }   /* 水筒(ひと休み) */
      { const g = T('kusa'); armL.add(g); g.position.set(0, -0.16, 0.02); for (let k = 0; k < 6; k++) { const b = new THREE.Mesh(new THREE.CylinderGeometry(0.0015, 0.003, 0.08, 3), soft(k % 2 ? '#6f9a3a' : '#8db04e')); b.position.set((k - 2.5) * 0.003, -0.035, 0); b.rotation.z = (k - 2.5) * 0.18; g.add(b); } M(soft('#6b5238'), 0.012, 0.008, 0.012, 0, -0.075, 0, g); }   /* 抜いたヒエ(根に泥) */
      { const g = T('kasa'); head.add(g); g.position.set(0, 0.15, -0.02); g.rotation.x = -0.25; const cn = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.13, 20, 1, true), new THREE.MeshStandardMaterial({ color: lin('#d9bd77'), roughness: 1, side: THREE.DoubleSide })); g.add(cn); const rim = new THREE.Mesh(new THREE.TorusGeometry(0.295, 0.012, 6, 28), soft('#c9a95e')); rim.rotation.x = Math.PI / 2; rim.position.y = -0.064; g.add(rim); const fr = new THREE.Group(); fr.name = 'kaeru'; fr.position.set(0.17, -0.02, 0.16); fr.rotation.y = 0.7; g.add(fr); const gm2 = soft('#7cc24f'); M(gm2, 0.024, 0.017, 0.03, 0, 0, 0, fr); for (const sx of [-1, 1]) { M(gm2, 0.009, 0.009, 0.009, sx * 0.012, 0.014, 0.016, fr); M(eyeM, 0.0045, 0.0045, 0.003, sx * 0.013, 0.017, 0.024, fr); M(gm2, 0.008, 0.005, 0.014, sx * 0.02, -0.01, -0.005, fr); } }   /* 雨の日の笠のふちに、アマガエル(6〜7月の雨はカエルの季節) */
      { const tb = new THREE.Group(); tb.name = 'tombo'; tb.visible = false; hat.add(tb); tb.position.set(0.05, 0.12, 0.02); tb.rotation.y = 0.6; tb.scale.setScalar(2.4);   /* 赤とんぼ(アキアカネ)が帽子のてっぺんで休む: 9〜10月の田んぼでよく見る姿【調査/11 愛知県 水辺のトンボ】 */
        const rb = std('#c8402a', 0.5), bd = new THREE.Mesh(new THREE.CylinderGeometry(0.0035, 0.002, 0.07, 5), rb); bd.rotation.x = Math.PI / 2; bd.position.z = -0.02; tb.add(bd); M(rb, 0.006, 0.006, 0.008, 0, 0, 0.018, tb);
        const wm = new THREE.MeshBasicMaterial({ color: 0xeef3f6, transparent: true, opacity: 0.45, side: THREE.DoubleSide });
        for (const [x, z] of [[1, 0.008], [-1, 0.008], [1, -0.004], [-1, -0.004]]) { const wg = new THREE.Mesh(new THREE.PlaneGeometry(0.045, 0.01), wm); wg.rotation.x = -Math.PI / 2; wg.position.set(x * 0.024, 0.002, z); wg.name = 'wing'; tb.add(wg); } }
      chibi.traverse((o) => { if (o.isMesh) o.frustumCulled = false; });
      chibi.userData = { mode: 'look', x0: -0.85 };
    }
    chibi.position.set(-1.15, 0.31, 0.62); chibi.rotation.y = 0.35; chibi.visible = false; scene.add(chibi);
    { const cv = document.createElement('canvas'); cv.width = cv.height = 128; const tx = new THREE.CanvasTexture(cv); if ('colorSpace' in tx) tx.colorSpace = THREE.SRGBColorSpace;   /* 見回りのふきだし: 見つけた物を絵だけで(店主 10/29「文字は廃止」) */
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tx, transparent: true, depthTest: false })); sp.scale.set(0.26, 0.26, 1); sp.renderOrder = 10; sp.visible = false; sp.userData = { cv, tx, ic: '' }; chibi.userData.bub = sp; scene.add(sp); }
    // となりの田で手植え(補植)をする人: 田植え機が植えのこした所や欠株に、腰のかごから苗を出して手で植える。腰を深く曲げる(店主の写真B)
    handPlanter = new THREE.Group();
    { const pants = std('#25324a', 0.9), shirt = std('#e4e3dc', 0.9), skin = std('#b98460', 0.8), hat = std('#d9c38c', 0.95), bk = std('#2f7fd6', 0.6), sd = std('#9cc94a', 0.9), boot = std('#1c1c1c', 0.5);
      for (const sx of [-1, 1]) { cyl(0.05, 0.055, 0.3, boot, sx * 0.09, 0.15, 0, handPlanter); cyl(0.065, 0.055, 0.55, pants, sx * 0.09, 0.55, 0, handPlanter); }
      const up = new THREE.Group(); up.position.set(0, 0.85, 0); up.rotation.x = 1.25; handPlanter.add(up);   /* 腰から上を前へ深く曲げる */
      cyl(0.15, 0.13, 0.55, shirt, 0, 0.28, 0, up); cyl(0.05, 0.05, 0.08, skin, 0, 0.6, 0, up);
      const hd = new THREE.Mesh(U, skin); hd.scale.set(0.1, 0.115, 0.105); hd.position.set(0, 0.68, 0.02); up.add(hd);
      const kasa = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.09, 18), hat); kasa.position.set(0, 0.76, 0.02); up.add(kasa);   /* 菅笠(浅く広い) */
      const armR = new THREE.Group(); armR.name = 'arm'; armR.position.set(0.17, 0.5, 0); up.add(armR); cyl(0.04, 0.035, 0.6, shirt, 0, -0.3, 0, armR); cyl(0.035, 0.035, 0.08, skin, 0, -0.62, 0, armR); cyl(0.015, 0.006, 0.14, sd, 0, -0.72, 0.02, armR);   /* 指先に2〜3本の苗 */
      cyl(0.04, 0.035, 0.5, shirt, -0.18, 0.28, 0.08, up, 0.5, 0.2);
      const basket = box(0.26, 0.2, 0.18, bk, -0.24, 0.92, 0.05, handPlanter); basket.rotation.z = 0.15;   /* 腰の青いかご */
      for (let i = 0; i < 6; i++) cyl(0.012, 0.012, 0.18, sd, -0.3 + i * 0.022, 1.08, 0.05 + (i % 2) * 0.03, handPlanter, 0.1 * (i % 3 - 1), 0.12); }
    handPlanter.position.set(-9.6, -0.12, -16); handPlanter.rotation.y = 1.45; handPlanter.visible = false; scene.add(handPlanter);
    tractor = new THREE.Group();
    { const parts = modelParts(), orange = '#e06a1b', dark = '#2a2a2a', rubber = '#1a1a1a', grey = '#8d8f8a';
      parts.box(0.46, 0.14, 1.4, dark, 0, 0.51, 0.4);
      parts.add(topBevel(0.58, 0.36, 0.9, 0.07), orange, 0, 0.78, 0.7);
      parts.box(0.46, 0.22, 0.016, dark, 0, 0.77, 1.158);
      for (let k = 0; k < 7; k++) parts.box(0.018, 0.19, 0.008, grey, (k - 3) * 0.055, 0.77, 1.17);
      for (const sx of [-1, 1]) parts.box(0.095, 0.065, 0.025, '#fff1cc', sx * 0.21, 0.9, 1.14);
      parts.box(0.42, 0.06, 0.3, dark, 0, 0.94, -0.12); parts.box(0.4, 0.3, 0.06, dark, 0, 1.07, -0.25);
      parts.rod([0, 0.9, 0.31], [0, 1.25, 0.12], 0.03, grey);
      parts.add(new THREE.TorusGeometry(0.12, 0.012, 6, 16), dark, 0, 1.25, 0.12, -1);
      /* タイヤの山は左右で向き合う */
      for (const sx of [-1, 1]) {
        for (const [r, width, x, y, z, count] of [[0.46, 0.24, sx * 0.45, 0.46, -0.2, 12], [0.27, 0.16, sx * 0.36, 0.27, 1.05, 8]]) {
          parts.add(new THREE.CylinderGeometry(r, r, width, 16), rubber, x, y, z, 0, 0, Math.PI / 2);
          parts.add(new THREE.CylinderGeometry(r * 0.43, r * 0.43, width + 0.016, 12), orange, x, y, z, 0, 0, Math.PI / 2);
          for (let k = 0; k < count; k++) for (const half of [-1, 1]) {
            const a = k * Math.PI * 2 / count, g = new THREE.BoxGeometry(width * 0.57, 0.03, r * 0.14);
            g.rotateY(half * 0.52); g.translate(half * width * 0.24, r, 0); g.rotateX(a); parts.add(g, '#30302b', x, y, z);
          }
        }
        parts.add(topBevel(0.3, 0.045, 0.8, 0.018), orange, sx * 0.45, 0.965, -0.2);
        parts.rod([sx * 0.355, 0.95, -0.46], [sx * 0.355, 1.76, -0.46], 0.02, dark);
      }
      parts.rod([-0.355, 1.76, -0.46], [0.355, 1.76, -0.46], 0.02, dark);
      parts.box(1.6, 0.42, 0.45, orange, 0, 0.32, -0.95); parts.box(1.62, 0.08, 0.5, grey, 0, 0.55, -0.95);
      parts.rod([0.18, 0.85, 0.95], [0.18, 1.35, 0.95], 0.03, dark); parts.finish(tractor);
    }
    // 代かき・田起こしのトラクターのうしろには、土から出てくる虫やカエルをねらってサギが集まる(田んぼでよく見る光景)
    for (const [dx, dz, r] of [[1.4, -1.6, 2.2], [2.3, -0.9, 1.7], [0.6, -2.4, 2.8]]) { const h = heron.clone(true); h.userData.base = [dx, dz, r]; h.visible = false; scene.add(h); tHerons.push(h); }
    tractor.position.set(-3.2, -0.1, -2.9); tractor.rotation.y = 0.9;   /* 車輪は泥に少し沈む */ tractor.visible = false; scene.add(tractor);
    planter = new THREE.Group();
    { const wht = std('#eef0ea', 0.5), grn = std('#2f7d3a', 0.6), tire = std('#1a1a1a', 0.95), seat = std('#2a2a2a', 0.6), nae = new THREE.MeshLambertMaterial({ color: lin('#6fae3c'), side: THREE.DoubleSide });
      box(0.72, 0.23, 1.1, wht, 0, 0.7, 0.25, planter); box(0.56, 0.16, 0.46, grn, 0, 0.88, 0.58, planter);   /* 胴を低く(Codex 3D 1) */
      box(0.4, 0.06, 0.34, seat, 0, 0.9, 0.0, planter); box(0.4, 0.3, 0.06, seat, 0, 1.06, -0.15, planter);   /* 座面と背もたれ: 運転席のすき間が見える */
      { const hw = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.012, 5, 14), seat); hw.position.set(0, 1.12, 0.42); hw.rotation.x = -1.1; planter.add(hw); cyl(0.015, 0.015, 0.3, seat, 0, 0.98, 0.48, planter, -0.45); }   /* ハンドル */
      for (const sx of [-1, 1]) { cyl(0.36, 0.36, 0.12, tire, sx * 0.48, 0.36, -0.15, planter, 0, Math.PI / 2); cyl(0.26, 0.26, 0.1, tire, sx * 0.42, 0.26, 0.75, planter, 0, Math.PI / 2); }
      const rack = new THREE.Group(); rack.position.set(0, 1.0, -0.72); rack.rotation.x = 0.55; planter.add(rack);   /* 苗のマットの面が横・ななめ上から見える向き */   // 苗をのせる台(苗箱6つぶん)
      box(1.8, 0.04, 0.7, grn, 0, 0, 0, rack); box(1.76, 0.025, 0.62, std('#5e9a3a', 0.9), 0, 0.032, 0, rack);   /* 苗のマット: びっしり生えた苗で緑のじゅうたん(写真07・08) */
      { /* 苗のマット: 6列×8束の交差した葉板を1つの形にまとめる(描画1回・乱数は使わない) Codex 3D 1 */
        const pos = [], col = [], uv = [], idx = [];
        for (let k = 0; k < 6; k++) for (let j = 0; j < 24; j++) { const x = -0.75 + k * 0.3 + ((j * 37) % 9 - 4) * 0.022, z = -0.28 + (j >> 1) * 0.05 + (j % 2) * 0.025, h = 0.07 + ((k * 13 + j * 7) % 5) * 0.012;
          for (const [ax, az] of [[0.05, 0.012], [-0.012, 0.05]]) { const b = pos.length / 3;
            pos.push(x - ax, 0.045, z - az, x + ax, 0.045, z + az, x + ax * 0.6, 0.045 + h, z + az * 0.6, x - ax * 0.6, 0.045 + h, z - az * 0.6);
            col.push(0.18, 0.36, 0.1, 0.18, 0.36, 0.1, 0.42, 0.72, 0.26, 0.42, 0.72, 0.26); uv.push(0, 0, 1, 0, 1, 1, 0, 1); idx.push(b, b + 1, b + 2, b, b + 2, b + 3); } }
        rack.add(new THREE.Mesh(geo(pos, col, uv, idx), new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }))); }
      box(1.8, 0.12, 0.25, wht, 0, 0.25, -1.05, planter); }   // 植えつけ部
    // 給水栓(明治用水のパイプライン): 畦に立つ水色の管と赤いハンドル。水を入れる旬は、口から田へ水がいきおいよく出る【JA・明治用水=田ごとの給水栓】
    valve = new THREE.Group();
    { const pipe = std('#7aa7c7', 0.5), red = std('#c4362c', 0.5), conc = std('#9d9a91', 0.9);
      box(0.32, 0.12, 0.32, conc, 0, 0.36, 0, valve); cyl(0.055, 0.055, 0.42, pipe, 0, 0.6, 0, valve); cyl(0.045, 0.045, 0.22, pipe, 0, 0.74, -0.1, valve, Math.PI / 2);
      const wh = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.012, 6, 18), red); wh.position.set(0, 0.86, 0); wh.rotation.x = Math.PI / 2; valve.add(wh); cyl(0.012, 0.012, 0.14, red, 0, 0.86, 0, valve, 0, Math.PI / 2);
      const jet = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.06, 0.6, 10, 1, true), new THREE.MeshStandardMaterial({ color: lin('#e8eef0'), roughness: 0.1, transparent: true, opacity: 0.65, depthWrite: false }));
      jet.position.set(0, 0.48, -0.32); jet.rotation.x = 0.7; jet.name = 'jet'; valve.add(jet);
      const foam = new THREE.Mesh(new THREE.CircleGeometry(0.16, 16), new THREE.MeshBasicMaterial({ color: lin('#f4f6f2'), transparent: true, opacity: 0.6, depthWrite: false })); foam.rotation.x = -Math.PI / 2; foam.position.set(0, 0.06, -0.55); foam.name = 'foam'; valve.add(foam); }
    valve.position.set(-1.82, 0, 0.3); scene.add(valve);
    // 溝切りの溝: 8〜10条(約2.5m)おきに、条の間へ深さ10cmほどの細い溝。濡れた泥の色で、水を抜くと黒い筋に見える
    mizoG = new THREE.Group();
    { /* 溝: まん中が濡れた泥色・ふちはぼかす(Codex画像レビュー「真っ黒で板のよう」) */
      const grad = (vert) => { const cv = document.createElement('canvas'); cv.width = vert ? 4 : 64; cv.height = vert ? 64 : 4; const g = cv.getContext('2d'), gr = vert ? g.createLinearGradient(0, 0, 0, 64) : g.createLinearGradient(0, 0, 64, 0); gr.addColorStop(0, '#000'); gr.addColorStop(0.3, '#999'); gr.addColorStop(0.5, '#fff'); gr.addColorStop(0.7, '#999'); gr.addColorStop(1, '#000'); g.fillStyle = gr; g.fillRect(0, 0, cv.width, cv.height); return new THREE.CanvasTexture(cv); };
      const mk = (vert) => new THREE.MeshStandardMaterial({ color: lin('#33291f'), roughness: 0.3, transparent: true, opacity: 0.78, alphaMap: grad(vert), depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
      const m = mk(false), mC = mk(true);
      for (let x = -FIELD_W + 0.2 + 0.3 * 4 + 0.15; x < FIELD_W; x += 0.3 * 8.5) { const g = new THREE.Mesh(new THREE.PlaneGeometry(0.13, 7.4), m); g.rotation.x = -Math.PI / 2; g.position.set(x, 0.006, -0.25 - 3.7); mizoG.add(g); }
      const cross = new THREE.Mesh(new THREE.PlaneGeometry(FIELD_W * 2 - 0.3, 0.13), mC); cross.rotation.x = -Math.PI / 2; cross.position.set(0, 0.006, -0.3); mizoG.add(cross); }   // 手前の畦ぎわの溝(水口・水尻へつなぐ)
    mizoG.visible = false; scene.add(mizoG);
    // 右どなりの区画(今年は麦→大豆): 手前だけ立体で。麦は5月に黄金色の穂、6月はじめに刈り取り→刈り株とわら。大豆は畝を立てて7月にまき、夏に丸い葉がしげり、10月に黄葉(2年3作)
    rotNear = new THREE.Group();
    { const r4 = mulberry(3131), N = 520, M4 = new THREE.Matrix4(), Q4 = new THREE.Quaternion(), E4 = new THREE.Euler(), P4 = new THREE.Vector3(), S4 = new THREE.Vector3();
      const place = (mesh, n, sx, sy, rowGap) => { for (let i = 0; i < n; i++) { const row = Math.floor(r4() * 22), x = FIELD_W + 1.0 + row * rowGap + (r4() - 0.5) * 0.06, z = -0.4 - r4() * 11; E4.set((r4() - 0.5) * 0.15, r4() * 6.3, (r4() - 0.5) * 0.15); Q4.setFromEuler(E4); P4.set(x, 0.02, z); S4.set(sx, sy * (0.8 + r4() * 0.4), sx); M4.compose(P4, Q4, S4); mesh.setMatrixAt(i, M4); } rotNear.add(mesh); };
      const wheat = new THREE.InstancedMesh(hillGeometry(5, 2, 0.008, 0.05, 0.2, 0.6), new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }), N); wheat.name = 'wheat'; place(wheat, N, 1, 0.85, 0.3);
      const ear = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.012, 0.008, 0.08, 5).translate(0, 0.82, 0), std('#d9b45a', 0.8), N); ear.name = 'ear'; ear.instanceMatrix.array.set(wheat.instanceMatrix.array); rotNear.add(ear);
      const stub = new THREE.InstancedMesh(hillGeometry(4, 1, 0.006, 0.02, 0.1, 0.7), new THREE.MeshLambertMaterial({ color: lin('#cdb273'), side: THREE.DoubleSide }), N); stub.name = 'stub'; place(stub, N, 1, 0.12, 0.3);
      const ridge = new THREE.Group(); ridge.name = 'ridge'; for (let k = 0; k < 11; k++) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.1, 11), std('#5a4532', 1)); b.position.set(FIELD_W + 1.15 + k * 0.7, 0.04, -5.9); ridge.add(b); } rotNear.add(ridge);
      const leafG = new THREE.SphereGeometry(1, 7, 5); leafG.scale(1, 0.55, 1);
      const soy = new THREE.InstancedMesh(leafG, new THREE.MeshLambertMaterial({ color: 0xffffff }), 360); soy.name = 'soy';
      for (let i = 0; i < 360; i++) { const k = i % 11, x = FIELD_W + 1.15 + k * 0.7 + (r4() - 0.5) * 0.05, z = -0.5 - (Math.floor(i / 11) / 33) * 10.8; P4.set(x, 0.1, z); Q4.identity(); S4.set(0.2, 0.2, 0.18); M4.compose(P4, Q4, S4); soy.setMatrixAt(i, M4); soy.setColorAt(i, hsl(105, 0.45, 0.28 + r4() * 0.06)); }
      rotNear.add(soy); rotNear.children.forEach((c) => { c.frustumCulled = false; c.visible = false; }); }
    scene.add(rotNear);
    // 田起こし前の田: 前の年の大豆の茎(こげ茶・15cmほど)が列に残り、あいだに冬の雑草(スズメノテッポウ・ナズナなどの緑の株)
    residue = new THREE.Group();
    { const r5 = mulberry(5151), M6 = new THREE.Matrix4(), Q6 = new THREE.Quaternion(), E6 = new THREE.Euler(), P6 = new THREE.Vector3(), S6 = new THREE.Vector3(1, 1, 1);
      const stem = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.004, 0.006, 0.16, 4).translate(0, 0.08, 0), std('#4e3a26', 0.9), 700);
      for (let i = 0; i < 700; i++) { const row = Math.floor(r5() * 22); P6.set(-FIELD_W + 0.4 + row * 0.7 + (r5() - 0.5) * 0.08, 0, -0.3 - r5() * 7.3); E6.set((r5() - 0.5) * 0.9, r5() * 6.3, (r5() - 0.5) * 0.9); Q6.setFromEuler(E6); S6.set(1, 0.6 + r5() * 0.8, 1); M6.compose(P6, Q6, S6); stem.setMatrixAt(i, M6); }
      const weed = new THREE.InstancedMesh(hillGeometry(7, 2, 0.08, 0.6, 0.9, 0.6), new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }), 260);
      for (let i = 0; i < 260; i++) { P6.set((r5() - 0.5) * (FIELD_W * 2 - 0.4), 0, -0.3 - r5() * 7.3); E6.set(0, r5() * 6.3, 0); Q6.setFromEuler(E6); S6.set(0.12 + r5() * 0.1, 0.05 + r5() * 0.05, 0.12 + r5() * 0.1); M6.compose(P6, Q6, S6); weed.setMatrixAt(i, M6); weed.setColorAt(i, hsl(95 + r5() * 20, 0.4, 0.33 + r5() * 0.08)); }
      stem.frustumCulled = weed.frustumCulled = false; residue.add(stem, weed); }
    residue.visible = false; scene.add(residue);
    // 左どなりの田(稲・まわりの農家と同じ「標準の日」に植えた田): 手前8mだけ立体。自分の田と植える日がちがうと、育ち方のちがいが見える
    { const r10 = mulberry(1010), n = 900, MB = new THREE.Matrix4(), QB = new THREE.Quaternion(), EB = new THREE.Euler(), PB = new THREE.Vector3(), SB = new THREE.Vector3(1, 1, 1);
      leftRice = new THREE.InstancedMesh(riceHillGeometry(8, 3), new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }), n); leftRice.userData.pos = [];
      for (let i = 0; i < n; i++) { const x = -FIELD_W - 0.85 - (i % 30) * 0.3 + (r10() - 0.5) * 0.03, z = -0.45 - Math.floor(i / 30) * 0.25 + (r10() - 0.5) * 0.03; leftRice.userData.pos.push([x, z, r10() * 6.3, r10()]); }
      leftRice.frustumCulled = false; leftRice.visible = false; scene.add(leftRice); }
    // いもち病の葉: 両はしのとがった細長い斑点(紡錘形)。まん中は灰白色、ふちは茶色、まわりに黄色いかさ【島根県・石川県】。見回りで見つけたときだけ、手前の株の葉に
    blastG = new THREE.Group();
    { const r6 = mulberry(6161), tex = canvasTex(32, 256, (g, w, h) => {
        const gr = g.createLinearGradient(0, 0, w, 0); gr.addColorStop(0, '#3f7a2a'); gr.addColorStop(0.5, '#5a9a38'); gr.addColorStop(1, '#3f7a2a'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
        g.strokeStyle = 'rgba(30,60,20,.5)'; g.lineWidth = 1; g.beginPath(); g.moveTo(w / 2, 0); g.lineTo(w / 2, h); g.stroke();   // 葉の中央の脈
        for (let i = 0; i < 6; i++) { const y = 30 + r6() * (h - 60), x = w * (0.3 + r6() * 0.4), L = 16 + r6() * 14;
          const sp = (rx, ry, c) => { g.fillStyle = c; g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, 7); g.fill(); };
          sp(6, L * 0.75, 'rgba(214,200,80,.65)'); sp(4, L * 0.55, '#7a4a26'); sp(2.2, L * 0.36, '#c9c4b2');
          g.strokeStyle = '#6a3c1e'; g.lineWidth = 0.8; g.beginPath(); g.moveTo(x, y - L * 0.55); g.lineTo(x, y - L * 0.95); g.moveTo(x, y + L * 0.55); g.lineTo(x, y + L * 0.95); g.stroke(); }   // 両はしから伸びる茶色の筋(壊死線)
      }, null);
      const m = new THREE.MeshLambertMaterial({ map: tex, side: THREE.DoubleSide });
      for (let k = 0; k < 5; k++) { const lf = new THREE.Mesh(new THREE.PlaneGeometry(0.018, 0.34), m); lf.position.set(0.9 + k * 0.07, 0.3, -0.48 - (k % 2) * 0.05); lf.rotation.set(-0.55 - 0.1 * k, 0.4 * k, 0.15 * (k - 2)); blastG.add(lf); } }
    blastG.visible = false; scene.add(blastG);
    // 紋枯病: 株元の水ぎわの茎(葉鞘)に、ふちが茶色で中が灰白色の楕円のしみ。上へのぼる【京都府・宮城県】
    sheathG = new THREE.Group();
    { const r7 = mulberry(7171), tex = canvasTex(32, 128, (g, w, h) => { g.fillStyle = '#8fae5a'; g.fillRect(0, 0, w, h);
        for (let i = 0; i < 4; i++) { const y = h * (0.55 + 0.4 * r7()) - i * 22, x = w / 2 + (r7() - 0.5) * 8; g.fillStyle = '#6b4a2a'; g.beginPath(); g.ellipse(x, y, 9, 15, 0, 0, 7); g.fill(); g.fillStyle = '#cfc8b2'; g.beginPath(); g.ellipse(x, y, 6.5, 11, 0, 0, 7); g.fill(); g.fillStyle = 'rgba(120,140,90,.5)'; g.beginPath(); g.ellipse(x, y, 3, 6, 0, 0, 7); g.fill(); } }, null);
      const m = new THREE.MeshLambertMaterial({ map: tex, side: THREE.DoubleSide });
      for (let k = 0; k < 8; k++) { const c = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.01, 0.2, 8, 1, true), m); const a9 = k * 0.785; c.position.set(-0.2 + Math.cos(a9) * 0.022, 0.1, -0.45 + Math.sin(a9) * 0.022);   /* 手前の列の株の株元をかこむ茎 */ c.rotation.set((r7() - 0.5) * 0.15, r7() * 6, (r7() - 0.5) * 0.15); sheathG.add(c); } }
    sheathG.visible = false; scene.add(sheathG);
    // トビイロウンカ: 株元に茶色の小さな虫がびっしり(体長4〜5mm)
    bphG = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 5, 4), std('#7a5434', 0.7), 160);
    { const r8 = mulberry(8181), M9 = new THREE.Matrix4(), P9 = new THREE.Vector3(), Q9 = new THREE.Quaternion(), S9 = new THREE.Vector3(0.0018, 0.0016, 0.0028); for (let i = 0; i < 160; i++) { const k = i % 4, a = r8() * 6.3; P9.set(0.4 + (k % 2) * 0.3 + Math.cos(a) * 0.016, 0.04 + r8() * 0.12, -0.45 - Math.floor(k / 2) * 0.18 + Math.sin(a) * 0.016); Q9.setFromEuler(new THREE.Euler(r8(), r8() * 6, 0)); M9.compose(P9, Q9, S9); bphG.setMatrixAt(i, M9); } }
    bphG.visible = false; bphG.frustumCulled = false; scene.add(bphG);
    // コンバイン(稲刈りを予約した旬): クローラー(ゴムのキャタピラ)・前の刈り取り部・籾をためるタンクと排出オーガー・日よけ
    combine = new THREE.Group();
    { const parts = modelParts(), orange = '#df6a1c', cream = '#e7e5dc', dark = '#262626', grey = '#9a9c97';
      /* 前後が丸い履帯と一周二十本の山 */
      const trackPoint = (distance) => {
        const straight = 1.58, arc = Math.PI * 0.21;
        if (distance < straight) return [0.42, -0.79 + distance, 1, 0];
        distance -= straight;
        if (distance < arc) { const a = distance / 0.21; return [0.21 + 0.21 * Math.cos(a), 0.79 + 0.21 * Math.sin(a), Math.cos(a), Math.sin(a)]; }
        distance -= arc;
        if (distance < straight) return [0, 0.79 - distance, -1, 0];
        const a = (distance - straight) / 0.21; return [0.21 - 0.21 * Math.cos(a), -0.79 - 0.21 * Math.sin(a), -Math.cos(a), -Math.sin(a)];
      };
      for (const sx of [-1, 1]) {
        const outline = [];
        for (let k = 0; k <= 10; k++) { const a = k * Math.PI / 10; outline.push([0.79 + 0.21 * Math.sin(a), 0.21 + 0.21 * Math.cos(a)]); }
        for (let k = 0; k <= 10; k++) { const a = k * Math.PI / 10; outline.push([-0.79 - 0.21 * Math.sin(a), 0.21 - 0.21 * Math.cos(a)]); }
        const shape = new THREE.Shape(); outline.forEach(([z, y], k) => { if (k) shape.lineTo(z, y); else shape.moveTo(z, y); }); shape.closePath();
        const track = new THREE.ExtrudeGeometry(shape, { depth: 0.36, bevelEnabled: false, steps: 1 }); track.translate(0, 0, -0.18); track.rotateY(-Math.PI / 2); parts.add(track, dark, sx * 0.62, 0, 0);
        for (let k = 0; k < 20; k++) { const [y, z, ny, nz] = trackPoint(k * (3.16 + 0.42 * Math.PI) / 20); parts.box(0.38, 0.025, 0.07, '#393a36', sx * 0.62, y + ny * 0.01, z + nz * 0.01, Math.atan2(nz, ny)); }
        for (let k = 0; k < 5; k++) parts.add(new THREE.CylinderGeometry(0.115, 0.115, 0.012, 10), '#555650', sx * 0.805, 0.21, -0.65 + k * 0.325, 0, 0, Math.PI / 2);
      }
      parts.box(1.4, 0.18, 1.86, orange, 0, 0.47, -0.05);
      parts.add(topBevel(1.5, 0.55, 1.9, 0.08), cream, 0, 0.7, -0.05);
      parts.add(topBevel(0.8, 0.7, 0.9, 0.08), cream, 0.35, 1.3, -0.45);
      for (const sx of [-1, 1]) { parts.box(0.016, 0.23, 1.05, orange, sx * 0.756, 0.61, -0.25); parts.box(0.018, 0.012, 1.6, dark, sx * 0.76, 0.87, -0.05); }
      parts.box(0.81, 0.016, 0.91, dark, 0.35, 1.04, -0.45);
      parts.box(0.55, 0.06, 0.6, dark, -0.4, 1.02, 0.55); parts.box(0.45, 0.32, 0.06, dark, -0.4, 1.2, 0.3);
      for (const x of [-0.68, -0.12]) parts.rod([x, 1, 0.55], [x, 1.7, 0.55], 0.02, grey);
      parts.box(0.75, 0.03, 0.75, cream, -0.4, 1.72, 0.55);
      /* タンク沿いに格納した排出筒 */
      parts.rod([0.59, 1.35, -0.8], [0.59, 1.76, -0.8], 0.065, orange);
      parts.rod([0.59, 1.76, -0.8], [0.59, 1.76, 0.8], 0.06, cream, 10);
      parts.rod([0.59, 1.76, 0.8], [0.59, 1.64, 0.8], 0.063, dark, 10); parts.finish(combine);
      const head = new THREE.Group(); head.position.set(0, 0.32, 1.25); head.rotation.x = 0.25; combine.add(head);
      const cutter = modelParts();
      cutter.box(1.6, 0.08, 0.12, grey, 0, -0.04, 0.19);
      cutter.box(1.6, 0.1, 0.16, orange, 0, 0.08, -0.17);
      for (let k = 0; k < 5; k++) {
        const x = -0.76 + k * 0.38;
        cutter.add(flatPart([[-0.055, 0.22], [-0.012, 0.66], [0, 0.7], [0.012, 0.66], [0.055, 0.22]], 0.035), cream, x, -0.02, 0);
        cutter.add(topBevel(0.08, 0.65, 0.12, 0.025), cream, x, 0.34, 0.11);
        cutter.box(0.025, 0.54, 0.016, dark, x, 0.33, 0.179);
        for (let j = 0; j < 6; j++) cutter.box(0.065, 0.012, 0.035, grey, x, 0.11 + j * 0.085, 0.198);
      }
      for (let k = 0; k < 4; k++) cutter.box(0.22, 0.025, 0.32, dark, -0.57 + k * 0.38, -0.025, 0);
      cutter.finish(head);
    }
    combine.position.set(1.6, 0, -3.3); combine.rotation.y = Math.PI;   /* 手前から奥へ、刈りながら進む */ combine.visible = false; scene.add(combine);
    planter.position.set(2.4, -0.08, -3.4); planter.rotation.y = -1.25;   /* 横から: 苗のマット・運転席・ハンドルが見える(写真11・12・Codex 3D 1) */ planter.visible = false; scene.add(planter);
    // 雑草との戦い: コナギ(ハート形の葉・高さ20cmほど)・オモダカ(やじり形の葉・長い柄)・クログワイ(丸い中空の茎・40〜70cm)・イボクサ(畦ぎわから這う)【宮城県 水稲の雑草】
    const leafShape = (kind) => { const sh = new THREE.Shape();
      if (kind === 'heart') { sh.moveTo(0, 0); sh.bezierCurveTo(0.03, 0.01, 0.034, 0.05, 0, 0.06); sh.bezierCurveTo(-0.034, 0.05, -0.03, 0.01, 0, 0); sh.moveTo(0, 0); }
      else { sh.moveTo(0, 0.09); sh.lineTo(0.026, 0.02); sh.lineTo(0.034, -0.05); sh.lineTo(0.008, -0.004); sh.lineTo(-0.008, -0.004); sh.lineTo(-0.034, -0.05); sh.lineTo(-0.026, 0.02); sh.lineTo(0, 0.09); }
      return new THREE.ShapeGeometry(sh, 6); };
    const heartGeo = leafShape('heart'), arrowGeo = leafShape('arrow');
    const leafMat = (c) => new THREE.MeshStandardMaterial({ color: lin(c), roughness: 0.45, side: THREE.DoubleSide });
    const petMat = std('#6f8f3a', 0.8), petGeo = new THREE.CylinderGeometry(0.0018, 0.0022, 1, 4); petGeo.translate(0, 0.5, 0);
    const plantOf = (geo, mat, n, hgt, tilt) => { const g = new THREE.Group(); for (let i = 0; i < n; i++) { const a = i / n * 6.3 + pr(), h = hgt * (0.7 + pr() * 0.5), pe = new THREE.Mesh(petGeo, petMat); pe.scale.set(1, h, 1); pe.rotation.set(Math.sin(a) * 0.25, 0, Math.cos(a) * 0.25); g.add(pe);
      const lf = new THREE.Mesh(geo, mat); const tip = new THREE.Vector3(0, h, 0).applyEuler(pe.rotation); lf.position.copy(tip); lf.rotation.set(-tilt, a, 0, 'YXZ'); lf.scale.setScalar(0.9 + pr() * 0.5); g.add(lf); } return g; };
    const rowX = (x) => -FIELD_W + 0.2 + 0.3 * Math.round((x + FIELD_W - 0.2) / 0.3) + 0.15;   /* 条の間(株と株の列のあいだ)に生える */
    const spots = [[-0.95, -0.6], [0.35, -0.7], [1.25, -0.58], [-0.35, -0.85], [0.85, -0.95], [-1.6, -0.75], [0.0, -0.55], [1.7, -0.8], [-1.25, -1.0], [0.6, -0.52]].map(([x, z]) => [rowX(x), z]);
    const mk = (name, build) => { const G = new THREE.Group(); spots.forEach(([x, z], i) => { const p = build(i); p.position.set(x + 0.02 * Math.sin(i * 3 + name.length), 0, z + 0.05 * Math.cos(i * 5)); G.add(p); }); G.visible = false; scene.add(G); weedG[name] = G; };
    mk('konagi', () => { const g = plantOf(heartGeo, leafMat('#3f7a2a'), 7, 0.13, 1.1); g.scale.setScalar(1.4); return g; });
    mk('omodaka', (i) => { const g = plantOf(arrowGeo, leafMat('#6aa23d'), 5, 0.3, 0.3); g.scale.setScalar(1.5); if (i % 2 === 0) { const st = new THREE.Mesh(petGeo, petMat); st.scale.set(1, 0.42, 1); g.add(st); for (let k = 0; k < 3; k++) { const fl = new THREE.Mesh(U, std('#f6f6f0', 0.6)); fl.scale.set(0.009, 0.004, 0.009); fl.position.set(Math.cos(k * 2.1) * 0.014, 0.34 + (k % 2) * 0.04, Math.sin(k * 2.1) * 0.014); g.add(fl); } } return g; });
    mk('kurogwai', () => { const g = new THREE.Group(), m = std('#4f8f35', 0.45), geo = new THREE.CylinderGeometry(0.0038, 0.0045, 1, 6); geo.translate(0, 0.5, 0); for (let k = 0; k < 22; k++) { const c = new THREE.Mesh(geo, m), a = pr() * 6.3, r = pr() * 0.05; c.position.set(Math.cos(a) * r, 0, Math.sin(a) * r); c.scale.set(1, 0.4 + pr() * 0.35, 1); c.rotation.set((pr() - 0.5) * 0.15, 0, (pr() - 0.5) * 0.15); g.add(c); } return g; });
    mk('ibokusa', (i) => { const g = new THREE.Group(), m = leafMat('#5e9a3a'); for (let k = 0; k < 14; k++) { const lf = new THREE.Mesh(new THREE.PlaneGeometry(0.018, 0.07), m); lf.position.set(k * 0.03, 0.02 + 0.01 * Math.sin(k), (k % 2 ? 1 : -1) * 0.015); lf.rotation.set(-Math.PI / 2 + 0.35, (k % 2 ? 1 : -1) * 0.9, 0, 'YXZ'); lf.position.z += (k % 2 ? 1 : -1) * 0.02; g.add(lf); if (k % 4 === 2) { const fl = new THREE.Mesh(U, std('#d98cc7', 0.6)); fl.scale.setScalar(0.005); fl.position.set(k * 0.03, 0.045, 0); g.add(fl); } } { const st = new THREE.Mesh(new THREE.CylinderGeometry(0.0015, 0.0015, 0.42, 4), std('#7a8f45', 0.8)); st.rotation.z = Math.PI / 2; st.position.set(0.21, 0.012, 0); g.add(st); }   /* 這う茎 */
      g.rotation.y = -0.4; return g; });
    weedG.ibokusa.children.forEach((p, i) => p.position.set(-1.8 + i * 0.35, 0, -0.2 - (i % 3) * 0.06));   // 畦ぎわ(水ぎわ)から田へ
    // 赤とんぼ(9月〜)
    const fg = new THREE.BufferGeometry();
    fg.setAttribute('position', new THREE.Float32BufferAttribute([-0.03, 0, 0, 0.03, 0, 0, 0, 0, 0.012, 0, 0, -0.035, 0, 0, 0.035, -0.06, 0, 0, 0.06, 0, 0], 3));
    fg.setIndex([0, 1, 2, 0, 3, 1, 4, 5, 6, 4, 6, 5]);
    flies = new THREE.InstancedMesh(fg, new THREE.MeshBasicMaterial({ color: lin('#c9472b'), side: THREE.DoubleSide }), 14);
    flies.visible = false; scene.add(flies);
    // 稲の先に止まる赤とんぼ(アキアカネ・体長約4cm): 赤い細い体と、すきとおった4枚のはねを水平に広げる
    perched = new THREE.Group();
    { const bodyM = std('#c9472b', 0.5), wingM = new THREE.MeshBasicMaterial({ color: lin('#e8eef0'), transparent: true, opacity: 0.45, side: THREE.DoubleSide, depthWrite: false });
      for (const [x, z, r] of [[-0.55, -0.55, 0.3], [0.25, -0.7, 2.1], [0.95, -0.5, -1.2], [-1.4, -0.9, 1.0], [1.6, -1.0, 2.8]]) { const g = new THREE.Group();
        const b = new THREE.Mesh(new THREE.CylinderGeometry(0.0018, 0.0012, 0.04, 5), bodyM); b.rotation.x = Math.PI / 2; g.add(b); const hd = new THREE.Mesh(U, bodyM); hd.scale.setScalar(0.003); hd.position.z = 0.021; g.add(hd);
        for (const [wz, wl] of [[0.008, 0.032], [0.002, 0.03]]) for (const sx of [-1, 1]) { const w = new THREE.Mesh(new THREE.PlaneGeometry(wl, 0.007), wingM); w.rotation.x = -Math.PI / 2; w.position.set(sx * wl / 2, 0.001, wz); g.add(w); }
        g.position.set(x, 0, z); g.rotation.y = r; g.scale.setScalar(1.4); perched.add(g); } }
    perched.visible = false; scene.add(perched);
    // 畦の花: 春はタンポポ(黄)とシロツメクサ(白)、9月下旬は彼岸花(赤)
    const flowerGeo = (petals, len, wid) => { const pos = [], idx = []; pos.push(0, 0, 0); for (let i = 0; i < petals; i++) { const a = i / petals * Math.PI * 2, a2 = a + 0.25; pos.push(Math.cos(a) * len, 0.02 + (petals > 8 ? 0.05 * Math.sin(i) : 0), Math.sin(a) * len, Math.cos(a2) * len * wid, 0.01, Math.sin(a2) * len * wid); idx.push(0, 1 + i * 2, 2 + i * 2); } const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals(); return g; };
    const placeOnLevees = (mesh, n, hgt) => { for (let i = 0; i < n; i++) { const front = i < n * 0.6; p.set(front ? (rnd() - 0.5) * 20 : (rnd() < 0.5 ? -1 : 1) * (FIELD_W + 0.35), (front ? 0.33 : 0.27) + hgt * (0.7 + rnd() * 0.6), front ? 0.25 + rnd() * 0.45 : -rnd() * 14); e.set(rnd() * 0.4, rnd() * 6.3, rnd() * 0.4); q.setFromEuler(e); M.compose(p, q, s1); mesh.setMatrixAt(i, M); } mesh.visible = false; scene.add(mesh); };
    lilies = new THREE.InstancedMesh(flowerGeo(12, 0.07, 0.25), new THREE.MeshLambertMaterial({ color: lin('#c4221b'), side: THREE.DoubleSide }), 140); placeOnLevees(lilies, 140, 0.32);
    { // 彼岸花: 葉のない茎がまっすぐ30〜50cm立ち、その先に赤い花がまとまって咲く(花びらは細く反り、しべが長く飛び出す)
      lilyStem = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.004, 0.005, 1, 4).translate(0, 0.5, 0), std('#4d7a2e', 0.8), 140); const M7 = new THREE.Matrix4(), P7 = new THREE.Vector3(), Q7 = new THREE.Quaternion(), S7 = new THREE.Vector3();
      for (let i = 0; i < 140; i++) { lilies.getMatrixAt(i, M7); M7.decompose(P7, Q7, S7); const base = P7.z > 0.1 ? 0.33 : 0.27; P7.y = base + 0.3 + (P7.y - base) * 0.6; M7.compose(P7, Q7, S7); lilies.setMatrixAt(i, M7); const h = P7.y - base; Q7.identity(); S7.set(1, h, 1); M7.compose(new THREE.Vector3(P7.x, base, P7.z), Q7, S7); lilyStem.setMatrixAt(i, M7); }
      lilyStem.visible = false; scene.add(lilyStem); }
    springFlowers = new THREE.InstancedMesh(flowerGeo(10, 0.018, 0.6), new THREE.MeshLambertMaterial({ vertexColors: false, side: THREE.DoubleSide }), 220); placeOnLevees(springFlowers, 220, 0.05);
    for (let i = 0; i < 220; i++) springFlowers.setColorAt(i, i % 3 ? lin('#f2c84b') : lin('#f4f4ee'));
    // ツバメ(5〜7月、田んぼの上を低く飛ぶ)
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0.09, -0.16, 0.02, -0.03, 0, 0, -0.02, 0.16, 0.02, -0.03, 0, 0, -0.02, -0.03, 0, -0.1, 0.03, 0, -0.1], 3)); sg.setIndex([0, 1, 2, 0, 2, 3, 2, 5, 4, 2, 4, 6]); sg.computeVertexNormals();
    swallows = new THREE.InstancedMesh(sg, new THREE.MeshLambertMaterial({ color: lin('#1d2433'), side: THREE.DoubleSide }), 5); swallows.visible = false; scene.add(swallows);
    // 稲刈り後のわら
    straw = new THREE.InstancedMesh(new THREE.BoxGeometry(0.5, 0.012, 0.012), std('#c8ad6e', 1), 900);
    for (let i = 0; i < 900; i++) { e.set(0, rnd() * 6.3, 0); q.setFromEuler(e); p.set((rnd() - 0.5) * FIELD_W * 2, 0.02, -rnd() * 8); M.compose(p, q, s1); straw.setMatrixAt(i, M); }
    straw.visible = false; scene.add(straw);
  }

  // ---------- 株の並べ方(条間30cm・株間は株数で変わる)と葉の枚数 ----------
  function layout(density, blades) {
    const key = density + ':' + blades + ':' + quality;
    if (key === layoutKey) return;
    const newPos = !hillPos.length || String(density) !== layoutKey.split(':')[0];
    layoutKey = key;
    if (newPos) {
      const rowGap = 0.30, hillGap = 3.3 / density / rowGap;
      hillPos = []; // 手前7.6mまでを1株ずつ。奥はすじ模様の平面
      for (let x = -FIELD_W + 0.2; x <= FIELD_W - 0.2; x += rowGap) for (let z = -0.45; z > -7.6; z -= hillGap) hillPos.push([x + (rnd() - 0.5) * 0.03, z + (rnd() - 0.5) * 0.03, rnd() * 6.3, rnd()]);
    }
    const n = hillPos.length;
    if (hillsRefl) { scene.remove(hillsRefl); hillsRefl.material.dispose(); hillsRefl = null; }   /* 形と並びは hills と共有(消すのは hills 側) */
    if (hills) for (const m of [hills, panicles, shadows, anthers]) { if (!m) continue; scene.remove(m); m.geometry.dispose(); m.material.dispose(); if (m.dispose) m.dispose(); }
    hills = new THREE.InstancedMesh(riceHillGeometry(blades, quality === 'high' ? 4 : 3), swayMaterial(null, true), n);
    panicles = new THREE.InstancedMesh(panicleGeometry(0), swayMaterial({ map: grainTexture(), alphaTest: 0.45, emissive: lin('#2a2a10') }), n);   // 群落の上面は日が当たって明るい(黒ずまない)
    panicles.userData.droop = 0;
    // 稲の花: 出穂から1週間ほど、籾が開いて白いおしべ(葯)が垂れる。穂と同じ形に、おしべだけの絵を重ねる(花の時期だけ表示)
    anthers = new THREE.InstancedMesh(panicles.geometry, swayMaterial({ map: antherTexture(), alphaTest: 0.5, color: lin('#f3f0d2') }), n);
    anthers.visible = false; anthers.frustumCulled = false; anthers.renderOrder = 2;
    hills.frustumCulled = panicles.frustumCulled = false;
    scene.add(hills); scene.add(panicles); scene.add(anthers);
    // 水面にうつる苗(写真A): 株の並びを上下さかさまにして水の下に置く。泥は奥行きを書かず、水のあとに薄く重ねる。植えてから田んぼが閉じるまで
    if (quality === 'high') {
      hillsRefl = new THREE.InstancedMesh(hills.geometry, swayMaterial({ transparent: true, opacity: 0.55, depthWrite: false, color: lin('#3a5a20'), emissive: lin('#557f2c') }, true), n);
      hillsRefl.instanceMatrix = hills.instanceMatrix; hillsRefl.instanceColor = hills.instanceColor;
      hillsRefl.scale.y = -1; hillsRefl.frustumCulled = false; hillsRefl.renderOrder = 3; hillsRefl.visible = false; scene.add(hillsRefl);
    }
    shadows = null;
    if (quality === 'high') {
      shadows = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: blobTexture(), transparent: true, depthWrite: false, color: 0x000000, opacity: 0.45 }), n);
      shadows.frustumCulled = false; shadows.renderOrder = 1; scene.add(shadows);
    }
  }

  // 麦→大豆の区画の色(西尾の2年3作: 麦は5月下旬〜6月上旬に黄金色→6月中旬に刈る→大豆を6月下旬〜7月にまく→夏は濃い緑→10〜11月に黄葉して刈る【JA西三河】)
  function rotColor(doy) {
    const k = (a, b) => clamp((doy - a) / (b - a), 0, 1);
    const wheat = hsl(92, 0.42, 0.34).lerp(hsl(46, 0.62, 0.55), k(135, 155)), stub = hsl(42, 0.32, 0.55), soilC = hsl(28, 0.3, 0.3);
    if (doy < 160) return wheat;
    if (doy < 172) return stub.lerp(soilC, k(165, 172));
    if (doy < 290) return soilC.clone().lerp(hsl(105, 0.42, 0.27), k(185, 225));
    return hsl(105, 0.42, 0.27).lerp(hsl(48, 0.5, 0.42), k(290, 305)).lerp(hsl(30, 0.3, 0.32), k(310, 325));
  }
  // ---------- 状態 → 見た目 ----------
  function look(f) {
    const v = f.vKey, hmax = HEIGHT[v] || 0.95;
    const s = { phase: 'none', h: 0, spread: 0.4, green: 1, ripe: 0, water: 0, lodged: f.lodged, burn: f.bphMax > 40 ? Math.min(1, (f.bphMax - 40) / 200 + 0.3) : 0, perHill: 3, dry: false };
    const last = f.daily.length ? f.daily[f.daily.length - 1] : null;
    s.rain = !!(last && last.rain);
    if (!f.transDoy) { s.phase = f.sowDoy ? 'nursery' : 'none'; s.water = f.puddleDoy != null ? (f.queued && f.queued('plant') && f.queue.find((q) => q.name === 'plant').doy - f.doy <= 2 ? 0.015 : 0.03) : 0;   /* 代かきのあとは水を張り、田植えの直前は1〜2cmに落とす */ s.dry = f.tillDepth != null && f.puddleDoy == null; if (s.dry) s.soil = 'till'; /* 田起こしの後は乾いた土、代かきで水を張る */ s.seedH = f.sowDoy ? clamp((f.doy - f.sowDoy) / 20, 0.1, 1) : 0; return s; }
    if (f.harvestDoy) { s.phase = 'harvested'; s.h = 0.13; s.water = 0; s.ripe = 1; s.dry = true; s.soil = 'fine'; return s; }
    const H = f.headDoy || f.forecastHeading();
    const direct = f.method === 'direct', lag = direct ? (f.emergeDoy || f.forecastEmerge()) - f.transDoy : 0;   /* 直播は芽が出るまで地上に何も見えない */
    if (direct && !f.emergeDoy) { s.phase = 'none'; s.water = 0; s.dry = true; s.soil = 'till'; return s; }   /* 芽が出る前は乾いた土だけ */
    const p = clamp((f.doy - f.transDoy - lag) / Math.max(20, H - f.transDoy - lag), 0, 1);
    s.h = f.headDoy ? hmax : direct ? 0.04 + (hmax - 0.04) * Math.pow(p, 1.3) : 0.16 + (hmax - 0.16) * Math.pow(p, 1.25);   // 草丈: 田植え3週間で30cmほど、中干しのころ50cm、穂が出るころ90〜100cm
    s.perHill = f.stems / (f.density / 3.3);
    s.spread = Math.max(0.34, s.h) * (0.55 + 0.5 * clamp(s.perHill / 22, 0, 1)); // 株の幅は草丈に比例(6月は条の間に水面が見え、7〜8月に田んぼが閉じる)
    s.green = clamp(f.nVeg() / f.nVegOpt(), 0.6, 1.4);
    s.ripe = f.headDoy ? clamp(f.accR / f.v.ripe, 0, 1) : 0;
    s.phase = f.headDoy ? 'headed' : 'growing';
    s.water = { shallow: 0.03, deep: 0.10, intermittent: 0.02, mid: 0, drained: 0, none: 0, dryfield: 0 }[f.water] ?? 0.03;
    s.dry = f.water === 'mid' || f.water === 'drained' || f.water === 'dryfield'; /* 直播は入水まで乾いた田 */
    if (f.water === 'dryfield') s.soil = 'till';
    else if (f.water === 'mid' && f.midStart != null) { const k = f.doy - f.midStart + (f.mizo ? 2 : 0) - Math.min(4, Math.floor((f.midRain || 0) / 15)); s.soil = k <= 3 ? 'wet' : k <= 14 ? 'fine' : 'crack'; }   /* 見回りの「👣」と同じ式(engine.js patrolEvents の soil) */
    else if (f.water === 'drained' && f.drainDoy != null) { const k = f.doy - f.drainDoy + (f.mizo ? 2 : 0); s.soil = k <= 3 ? 'wet' : k <= 14 ? 'fine' : 'crack'; }
    return s;
  }
  function leafColor(s, j) {
    if (s.phase === 'harvested') return hsl(40, 0.4, 0.5 + j * 0.06);
    const g = s.green; // 窒素が多いほど濃い緑
    const base = hsl(88 + 14 * (g - 1), 0.42 + 0.1 * (g - 1), 0.36 - 0.08 * (g - 1) + (j - 0.5) * 0.05);
    const k = clamp((s.ripe - 0.45) / 0.55, 0, 1) * 0.4;   // 株全体は少しだけ。下の葉から黄色くなる分は uSen(シェーダー)で
    const young = s.phase === 'growing' ? clamp(1 - (s.h - 0.18) / 0.3, 0, 1) * clamp(1.3 - 0.3 * g, 0, 1) : 0;   /* 植えたての苗は日に透ける明るい黄緑 */
    return base.lerp(hsl(96, 0.66, 0.42 + (j - 0.5) * 0.1), 0.85 * young).lerp(hsl(44, 0.45, 0.5), k);
  }
  function panicleColor(s, j) { const r = Math.pow(s.ripe, 1.3); return hsl(76 - 32 * r, 0.36 + 0.26 * r, 0.6 - 0.04 * r + (j - 0.5) * 0.05); }   // 出たばかりの穂は淡い黄緑、実ると黄金色

  F3.update = function (f) {
    if (!renderer) return;
    lastFarm = f; stats.updatedAt = performance.now(); stats.firstAfterUpdate = null;
    if (focusKind && f.doy !== focusDoy) { focusKind = null; yaw = pitch = 0; placeCamera(); if (F3.onFocus) F3.onFocus(null); }
    kick();
    const s = look(f);
    const tyNear = f.w && f.w.typhoons && f.w.typhoons.some((t) => f.doy - t >= 0 && f.doy - t <= 2), tyAfter = f.w && f.w.typhoons && f.w.typhoons.some((t) => f.doy - t >= 0 && f.doy - t <= 6);   // 台風が来た日から2日は、強い風で田んぼじゅうが波打つ
    raining = s.rain || tyNear; rain.visible = raining; uniforms.uWind.value = tyNear ? 3.4 : raining ? 1.6 : 0.9; rain.rotation.z = tyNear ? 0.45 : 0;
    setSky(raining ? 'rain' : 'clear');
    { const m = dateOf3(f.doy); cumulus.forEach((c) => (c.visible = !raining && (m === 7 || m === 8))); if (uroko) uroko.visible = !raining && (m === 9 || m === 10); }
    const env = raining ? envRain : envClear;
    for (const m of [water, scene.getObjectByName('ditch')]) if (m && m.material.envMap !== env) { m.material.envMap = env; m.material.needsUpdate = true; }
    // 光: 季節で太陽の高さが変わる(夏至ごろ高く、秋は低く暖かい色)
    const alt = 0.55 + 0.35 * Math.cos((f.doy - 172) / 365 * 2 * Math.PI);
    // 時刻: 旬ごとに見回りの時刻が変わる(朝・昼・夕)。朝は東から低い光ともや、夕方は西から赤い光。乱数の列は使わない
    const tod = raining ? 1 : f.timeOfDay ? f.timeOfDay(f.doy) : 1;   // 0=朝 1=昼 2=夕
    const sx = tod === 0 ? 10 : tod === 2 ? -12 : -8, sy = tod === 1 ? 14 * alt + 2 : 3.2, sz = tod === 1 ? 6 : -2;
    sun.position.set(sx, sy, sz); sun.color.copy(lin(tod === 0 ? '#ffe9c9' : tod === 2 ? '#ffb070' : f.doy > 245 ? '#ffe2b8' : '#fff4e0'));
    if (renderer) renderer.toneMappingExposure = raining ? 1.0 : tod === 1 ? 1.15 : 1.05;   /* 晴れた昼の田んぼはまぶしい(写真Aとくらべて中景が3割暗かった) */
    sun.intensity = raining ? 0.25 : tod === 1 ? 2.2 : 1.6; hemi.intensity = raining ? 1.0 : tod === 1 ? 0.9 : 0.75;
    sky.material.uniforms.sunDir.value.set(sx, sy, tod === 1 ? -30 : -60).normalize();
    if (scene.fog) { scene.fog.density = raining ? 0.0042 : tod === 0 ? 0.0105 : 0.0042; if (!raining && tod === 2) scene.fog.color.lerp(lin('#e8b48a'), 0.35); if (!raining && tod === 0) scene.fog.color.lerp(lin('#eef0ee'), 0.5); }
    if (!raining && tod === 2) { sky.material.uniforms.hor.value.lerp(lin('#f4b07c'), 0.55); sky.material.uniforms.top.value.lerp(lin('#6f86b5'), 0.3); clouds.forEach((c) => c.material.color.copy(lin('#ffd2b0'))); }
    if (!raining && tod === 0) sky.material.uniforms.hor.value.lerp(lin('#f3efe6'), 0.4);   // 朝もや・夕焼け
    const M = new THREE.Matrix4(), P = new THREE.Vector3(), Q = new THREE.Quaternion(), E = new THREE.Euler(), S = new THREE.Vector3();
    // 苗
    nursery.visible = s.phase === 'nursery' && !(f.bought && f.doy < f.buyArrive);   // 買った苗は届くまで苗床に何もない
    if (nursery.visible) { const sd = nursery.getObjectByName('seedlings'); nursery.userData.pos.forEach(([x, y, z, r, j], i) => { Q.setFromEuler(E.set(0, r, 0)); P.set(x, y, z); const age = f.doy - f.sowDoy, hh = age < 4 ? 0.006 + 0.004 * age : 0.02 + 0.13 * s.seedH * (0.85 + 0.3 * j); S.set(age < 4 ? 0.3 : 0.5 + 0.5 * s.seedH, hh, age < 4 ? 0.3 : 0.5 + 0.5 * s.seedH); M.compose(P, Q, S); sd.setMatrixAt(i, M); sd.setColorAt(i, age < 4 ? hsl(58, 0.35, 0.78) : age < 8 ? hsl(85, 0.45, 0.5 - 0.02 * (age - 4)) : hsl(95 + 10 * j, 0.5, 0.36 + 0.08 * j));   /* 芽が出たばかりは白っぽい黄色(緑化の前)、1週間ほどで緑の葉に。稚苗は約20日で12〜15cm */ }); sd.instanceMatrix.needsUpdate = true; if (sd.instanceColor) sd.instanceColor.needsUpdate = true; }
    // 畦の草: 最後に刈ってからの日数で伸びる(田植えの前に一度刈ってある)
    const lastMow = f.mows.length ? f.mows[f.mows.length - 1] : f.transDoy ? f.transDoy - 5 : f.doy;
    const gh = 0.06 + 0.28 * clamp((f.doy - lastMow) / 40, 0, 1);   // 畦の草は刈らないと30〜40cmに。田の中まで倒れこまない高さに
    const lkOpen = (f.patrolEvents ? f.patrolEvents() : []).some((e) => e.kind === 'leak' && !e.fixed);
    for (let i = 0; i < grass.count; i++) { grass.getMatrixAt(i, M); M.decompose(P, Q, S); const near = lkOpen && Math.abs(P.x + 2.6) < 0.9 && P.z > 0.2, front = P.y > 0.3, path = front && ((Math.abs(P.z - 0.6) < 0.08 && P.x > -2.4 && P.x < 2.4) || (Math.abs(P.x + 0.85) < 0.75 && P.z > 0.5)), clump = (((Math.floor(P.x * 2.5) * 73856093) ^ (Math.floor(P.z * 9) * 19349663)) >>> 0) % 10 / 10; const hh = (near ? 0.25 : path ? 0.28 : 1) * gh * (0.42 + 0.7 * clump + 0.28 * ((i * 7) % 10) / 10),   /* 畦の上は農家さんが歩く所ぜんぶ踏み跡で低く・草は数本ずつのまとまりで高さがちがう(レビュー2回目の3) */ wz = 0.35 + 0.65 * Math.min(1, hh / 0.34) * (near ? 0.4 : 1); S.set(wz * 0.55, hh, wz * 0.55);   /* 葉の横への広がりも草丈に合わせる */ M.compose(P, Q, S); grass.setMatrixAt(i, M); }   // 穴を見つけた所は草をかき分けて見る
    grass.instanceMatrix.needsUpdate = true;
    grass.material.color.copy(f.mows.length && f.doy - lastMow <= 7 ? lin('#efe9a8') : lin('#ffffff'));   /* 刈ってすぐは切り口で明るい黄緑 */
    // 水と土(中干し・落水では乾いてひび割れる)
    water.visible = s.water > 0; water.position.y = s.water;
    water.material.normalScale.set(raining ? 0.35 : 0.16, raining ? 0.35 : 0.16);   /* 風のない日の田んぼは鏡のよう */
    { const can = s.phase === 'growing' || s.phase === 'headed' ? clamp((s.h - 0.2) / 0.5, 0, 1) * clamp(s.spread, 0, 1) : 0; const mudd = f.puddleDoy != null ? clamp(1 - (f.doy - f.puddleDoy) / 12, 0, 1) : 0; uniforms.uSkyW.value = (raining ? 0.2 : 1) * (1 - 0.85 * can) * (1 - 0.6 * mudd); water.material.envMapIntensity = 1.05 * (1 - 0.8 * can) * (1 - 0.45 * mudd); water.material.color.copy(lin('#18202a').lerp(lin('#6a5742'), mudd)).multiplyScalar(1 - 0.45 * can); water.material.opacity = 0.34 + 0.55 * mudd + 0.4 * can;   /* 足もと(真上から)は泥がよく透ける。浅く見るほど空がうつる(シェーダー) */ }   /* 代かきのあとは泥で濁った水(10日ほどで澄む) */   // 稲がしげると水面は葉のかげになり、空がうつらず暗い
    const mudMap = s.soil === 'till' ? texTill : s.soil === 'fine' ? texDryFine : s.soil === 'wet' ? texMud : s.dry ? texDry : texMud; if (mud.material.map !== mudMap) { mud.material.map = mudMap; mud.material.needsUpdate = true; }   /* 田起こし後=土のかたまり/中干し・落水は乾き具合で しめった泥→細かいひび→大きなひび */
    mud.material.color.copy(s.phase === 'none' && f.tillDepth == null ? lin('#c9bba0') : s.soil === 'wet' ? lin('#b3a888') : s.water > 0 && !s.dry ? lin('#cdcf98') : lin('#ffffff'));   /* 水の下の泥はぬれてオリーブがかった黄土色に(次の行で白に戻していて、これまで効いていなかった) */
    // 生き物
    heron.visible = s.phase === 'growing' && s.water > 0 && s.h < 0.7 && (f.doy % 3) !== 0 && !raining;
    showFlies = f.doy >= 240 && f.doy <= 300 && !raining; flies.visible = showFlies;
    perched.visible = showFlies && s.phase === 'headed'; if (perched.visible) perched.position.y = s.h * (1.16 - 0.08 * s.ripe);   // 穂の先に止まる
    straw.visible = s.phase === 'harvested' || (combine && combine.visible);   // コンバインが細かく切ったわらは、刈ったあとに散らばる
    if (straw.visible && !straw.userData.cutDone && combine && combine.visible) { const M8 = new THREE.Matrix4(), P8 = new THREE.Vector3(), Q8 = new THREE.Quaternion(), S8 = new THREE.Vector3(); for (let i = 0; i < straw.count; i++) { straw.getMatrixAt(i, M8); M8.decompose(P8, Q8, S8); if (!(P8.x > 0.8 && P8.x < 2.4 && P8.z > -2.3)) { S8.set(0, 0, 0); M8.compose(P8, Q8, S8); straw.setMatrixAt(i, M8); } } straw.instanceMatrix.needsUpdate = true; straw.userData.cutDone = true; }
    lilies.visible = f.doy >= 258 && f.doy <= 280; if (lilyStem) lilyStem.visible = lilies.visible;                       // 彼岸花: 9月中旬〜10月上旬
    springFlowers.visible = f.doy >= 85 && f.doy <= 150;                  // タンポポ・シロツメクサ: 3月下旬〜5月
    swallows.visible = f.doy >= 120 && f.doy <= 205 && !raining;
    const pev = f.patrolEvents ? f.patrolEvents() : [], open = (k) => pev.some((e) => e.kind === k && !e.fixed);
    hieG.visible = open('hie') && s.phase === 'growing';
    if (hieG.visible) { const hh = Math.max(0.35, s.h) * 1.3; hieG.children.forEach((p) => { p.getObjectByName('leaf').scale.set(1.25, hh, 1.25); const pn = p.getObjectByName('pan'); pn.visible = f.doy >= 213; pn.position.y = hh * 0.93; pn.scale.setScalar(1.3); }); }   // 稲より頭ひとつ高い。8月はじめから穂(緑〜赤紫)
    sparrows.visible = open('bird') && s.phase === 'headed' && !raining;
    husks.visible = (open('bird') || (f.birdLoss || 0) > 0) && s.phase === 'headed'; if (husks.visible) husks.position.y = Math.max(0, s.water);
    if (sparrows.visible) sparrows.children.forEach((b) => { b.userData.y0 = s.h * 0.96 + 0.025; b.position.y = b.userData.y0; });
    leakHole.visible = open('leak');
    if (leakHole.visible) { const w = leakHole.getObjectByName('whirl'); w.visible = s.water > 0; w.position.y = s.water + 0.004; }
    nagaeG.visible = open('nagae') || (f.nagaeLv > 0 && !f.nagaeDone);
    snailG.visible = open('snail') && s.water > 0; if (snailG.visible) snailG.position.y = s.water;
    eggG.visible = open('egg'); if (eggG.visible) eggG.position.y = Math.max(0, s.water);
    const kameOpen = open('kame');
    farmer.visible = false && (f.pDone === f.doy || kameOpen || (f.lastWeed != null && f.doy - f.lastWeed < 3)) && !raining && !f.harvestDoy;
    { const nb = f.sprays ? f.sprays.filter((x) => x.target === 'bug') : [], recentT = f.transDoy && f.doy - f.transDoy < 12, md = raining ? 'kasa' : f.harvestDoy ? 'taba' : s.phase === 'headed' && s.ripe > 0.7 ? 'kama' : kameOpen ? 'ami' : s.phase === 'headed' ? 'look' : open('hie') || (f.lastWeed != null && f.doy - f.lastWeed < 3) ? 'weed' : recentT ? 'plant' : f.sowDoy && !f.transDoy && !f.bought ? 'can' : f.pDone === f.doy ? 'walk' : (f.doy % 20) >= 10 && s.phase !== 'none' ? 'rest' : 'look';   /* その旬の作業(見た目だけ)。何もない旬は、ながめるか畦でひと休み */
      chibi.visible = true; chibi.userData.mode = chibi.userData.force || md; const mdx = chibi.userData.mode, inField = false;   /* 草とり・かまは畦から(田の中だと稲にかくれて見えない) */ chibi.userData.inField = inField;
      chibi.position.set(mdx === 'can' ? -1.58 : -0.85, 0.31, mdx === 'can' ? 0.5 : 0.62);   /* じょうろは苗箱の左はしに立って、箱へ水をかける */ chibi.userData.y0 = chibi.position.y; if (chibi.userData.lastMode !== mdx) { chibi.rotation.y = mdx === 'can' ? 1.35 : mdx === 'plant' || mdx === 'weed' || mdx === 'kama' ? 0.8 : 0.35; chibi.userData.lastMode = mdx; }   /* 作業がかわったら、その向きから */
      chibi.getObjectByName('hat').visible = mdx !== 'kasa'; chibi.getObjectByName('kaeru').visible = f.doy >= 150 && f.doy <= 220; chibi.getObjectByName('tombo').visible = mdx !== 'kasa' && ((f.doy >= 245 && f.doy <= 300 && !raining) || chibi.userData.forceTombo); for (const n of ['can', 'nae', 'kama', 'ami', 'taba', 'kasa', 'kusa', 'suito']) chibi.getObjectByName(n).visible = n === mdx || (mdx === 'plant' && n === 'nae') || (mdx === 'weed' && n === 'kusa') || (mdx === 'rest' && n === 'suito'); }   // 見回り・すくい取り・草とりの旬は田に農家さん farmer.getObjectByName('net').visible = kameOpen;
    mizoG.visible = !!f.mizo && !f.harvestDoy;
    ripples.visible = raining && s.water > 0 && !f.harvestDoy; if (ripples.visible) ripples.position.y = s.water + 0.002;
    { const lt = pev.filter((e) => e.kind === 'life').map((e) => e.text).join(''); lifeG.tad.visible = (/オタマジャクシ/.test(lt) || (f.doy >= 130 && f.doy <= 195)) && s.water > 0 && !s.dry; lifeG.frog.visible = /カエル/.test(lt) && !raining; lifeG.strider.visible = (/アメンボ/.test(lt) || (f.doy >= 105 && f.doy <= 265)) && s.water > 0 && !raining && !f.harvestDoy; const wetS = s.water > 0 && !s.dry && !f.harvestDoy; lifeG.cray.visible = wetS && f.doy >= 125 && f.doy <= 255; lifeG.bull.visible = wetS && f.doy >= 160 && f.doy <= 245 && s.h < 0.75; lifeG.gen.visible = wetS && f.doy >= 150 && f.doy <= 240 && !raining; lifeG.dojo.visible = f._dojoAt === f.doy && s.water > 0; lifeG.dojo.position.y = s.water; lifeG.dojo.getObjectByName('hello').visible = !!f._dojoHi;   /* ドジョウのメインイベント */ lifeG.cray.position.y = Math.max(0, s.water) * 0.25; lifeG.bull.position.y = s.water; lifeG.gen.position.y = s.water - 0.004; /* 季節の生き物(ループ9) */ lifeG.tad.position.y = Math.max(0, s.water) * 0.6; lifeG.strider.position.y = s.water; lifeG.frog.position.y = Math.max(0, s.h - 0.15) * 0.4; }
    debris.visible = tyAfter && s.water > 0 && !f.harvestDoy; if (debris.visible) debris.position.y = s.water;
    { const tp = f.v.stdPlant, d = f.doy, H = f.regionHeading ? f.regionHeading() : tp + 80, cut = H + 45;   // 左どなり: 標準の日に植え、地域の出穂、出穂から約45日で刈る
      leftRice.visible = d >= tp && d < cut; if (leftRice.visible) {
        const p = clamp((d - tp) / Math.max(20, H - tp), 0, 1), h = d >= H ? (HEIGHT[f.vKey] || 0.95) : 0.16 + ((HEIGHT[f.vKey] || 0.95) - 0.16) * Math.pow(p, 1.25), sp = Math.max(0.2, h) * (0.55 + 0.5 * p), ripe = d >= H ? clamp((d - H) / 40, 0, 1) : 0;
        const MB = new THREE.Matrix4(), QB = new THREE.Quaternion(), EB = new THREE.Euler(), PB = new THREE.Vector3(), SB = new THREE.Vector3();
        leftRice.userData.pos.forEach(([x, z, ry, j], i) => { EB.set(0, ry, 0); QB.setFromEuler(EB); PB.set(x, 0, z); SB.set(sp * (0.9 + 0.2 * j), h * (0.92 + 0.12 * j), sp * (0.9 + 0.2 * j)); MB.compose(PB, QB, SB); leftRice.setMatrixAt(i, MB); leftRice.setColorAt(i, hsl(95 - 50 * ripe, 0.45, 0.33 + 0.18 * ripe + (j - 0.5) * 0.05)); });
        leftRice.instanceMatrix.needsUpdate = true; leftRice.instanceColor.needsUpdate = true; } }
    sheathG.visible = open('sheath'); if (sheathG.visible) sheathG.position.y = Math.max(0, s.water) * 0.5;
    bphG.visible = open('bph'); if (bphG.visible) bphG.position.y = Math.max(0, s.water) * 0.6;
    blastG.visible = open('blast') && !f.headDoy; if (blastG.visible) blastG.position.y = Math.max(0, s.water) + Math.max(0, s.h - 0.55) * 0.5;
    residue.visible = !f.sowDoy || (!f.transDoy && f.tillDepth == null && f.method !== 'direct');   // 田起こしで土にすきこまれる
    { const d = f.doy, g = (n) => rotNear.getObjectByName(n), k = (a, b) => clamp((d - a) / (b - a), 0, 1);
      const wOn = d < 158, sOn = d >= 158 && d < 182, rOn = d >= 185, soyOn = d >= 200 && d < 318;
      g('wheat').visible = g('ear').visible = wOn; if (wOn) { g('wheat').material.color.copy(hsl(92, 0.42, 0.42).lerp(hsl(46, 0.6, 0.6), k(128, 150))); g('ear').material.color.copy(hsl(80, 0.35, 0.45).lerp(hsl(44, 0.62, 0.6), k(128, 150))); }
      g('stub').visible = sOn; g('ridge').visible = rOn; g('soy').visible = soyOn;
      if (soyOn) { const sz = 0.05 + 0.32 * k(200, 245), sen = k(290, 312), M5 = new THREE.Matrix4(), P5 = new THREE.Vector3(), Q5 = new THREE.Quaternion(), S5 = new THREE.Vector3(); const so = g('soy'); for (let i = 0; i < so.count; i++) { so.getMatrixAt(i, M5); M5.decompose(P5, Q5, S5); P5.y = 0.08 + sz * 0.5; S5.set(sz, sz * 0.8, sz * 0.9); M5.compose(P5, Q5, S5); so.setMatrixAt(i, M5); } so.instanceMatrix.needsUpdate = true; so.material.color.copy(hsl(0, 0, 1).lerp(hsl(48, 0.8, 0.75), sen)); } }
    combine.visible = !f.harvestDoy && (f.queued ? f.queued('harvest') : false);
    { const recent = (x) => x != null && f.doy - x >= 0 && f.doy - x <= 4, inflow = !f.harvestDoy && !f.drainDoy && (recent(f.puddleDoy) || recent(f.flooded) || (f.transDoy && f.water === 'deep') || f.flush || (f.midEnd != null && f.doy - f.midEnd <= 4)); const j = valve.getObjectByName('jet'), fm = valve.getObjectByName('foam'); j.visible = fm.visible = inflow; fm.position.y = Math.max(0.03, s.water) + 0.004; }
    tractor.visible = ((f.puddleDoy != null && f.doy - f.puddleDoy <= 9) || (f.queued && f.queued('puddle'))) && !f.transDoy;   /* 代かきの予約が入った旬から、田にトラクター(見回るボタンで止まる場面) */
    tHerons.forEach((h) => { h.visible = tractor.visible && !raining; const [dx, dz, r] = h.userData.base; h.position.set(tractor.position.x + dx, 0, tractor.position.z + dz); h.rotation.y = r; });
    planter.visible = f.method !== 'direct' && f.transDoy != null && f.doy - f.transDoy <= 9 && !f.harvestDoy;
    handPlanter.visible = !raining && !f.harvestDoy && (f.doy % 3) !== 1 && (f.transDoy != null ? f.doy - f.transDoy <= 12 : f.puddleDoy != null);   /* となりも同じころに植えて、手で補植する */
    for (const k in weedG) { weedG[k].visible = open(k) && s.phase === 'growing'; if (weedG[k].visible) weedG[k].position.y = Math.max(0, s.water) * (k === 'kurogwai' || k === 'omodaka' ? 0.2 : 1); }
    if (nagaeG.visible) {   // 見つけたばかりは水口のわきだけ。見のがすほど畦ぞいに広がる
      const u = nagaeG.userData, c = u.cut[Math.round((u.cut.length - 1) * [0.22, 0.4, 0.58, 0.74, 0.88, 1][Math.min(5, f.nagaeLv || 0)])];
      u.leaf.geometry.setDrawRange(0, c.leaf); u.stem.geometry.setDrawRange(0, c.stem); u.fl.count = c.fl; nagaeG.position.y = Math.max(0.02, s.water);
    }
    // 株
    const showPlants = s.phase === 'growing' || s.phase === 'headed' || s.phase === 'harvested';
    const farBase = s.water > 0 ? lin('#5f6d63') : s.dry ? lin('#7a654a') : lin('#4b3a2a');
    if (!showPlants) {
      if (hills) { hills.visible = panicles.visible = false; if (shadows) shadows.visible = false; }
      farPlane.visible = s.water <= 0; farPlane.material.opacity = 1; farPlane.material.color.copy(farBase); sideFields.forEach((m) => { m.material.color.copy(m.userData.rot ? rotColor(f.doy) : farBase); if (m.userData.wp) { const wet = s.water > 0; m.visible = !wet; m.material.opacity = 1; m.userData.wp.visible = m.userData.mp.visible = wet; if (wet) sideMudMat.color.copy(mud.material.color); } });
      return;
    }
    const blades = Math.min(QUALITY[quality].blades, s.phase === 'harvested' ? 6 : s.perHill < 7 ? 10 : s.perHill < 15 ? 12 : 18);   // 茎がふえると葉もふえる
    layout(f.density || 60, blades);
    hills.visible = true; panicles.visible = s.phase === 'headed';
    const droop = Math.round(clamp(s.ripe * 1.3, 0, 1) * 3) / 3;   // 実るほど垂れる(4段階)
    if (panicles.visible && panicles.userData.droop !== droop) { panicles.geometry.dispose(); panicles.geometry = panicleGeometry(droop); anthers.geometry = panicles.geometry; panicles.userData.droop = droop; }
    const burnAt = [[-2.5, -4.2], [3.1, -6.5], [0.4, -2.6]];
    const missSnail = Math.min(0.2, (f.snailLoss || 0) * 4), missFloat = Math.min(0.12, (f.floatLoss || 0) * 3);   // 欠株: タニシは畦ぎわ(水の浅い・貝の寄る所)に多く、浮き苗はあちこち【見た目の強さは設定】
    const youngV = s.phase === 'growing' ? clamp(1 - (s.h - 0.18) / 0.4, 0, 1) : 0;
    for (let i = 0; i < hillPos.length; i++) {
      const [x, z, ry, j] = hillPos[i];
      const h2 = (Math.sin(x * 12.9898 + z * 78.233) * 43758.5453) % 1, h3 = (Math.sin(x * 39.346 + z * 11.135) * 24634.6345) % 1, hv = Math.abs(h2), hw = Math.abs(h3);   /* 株ごとのばらつき(乱数の列は使わない) */
      let tilt = 0, hb = s.h, burned = false;
      const cut = combine && combine.visible && x > 0.8 && x < 2.4 && z > -2.3;   // コンバインが通ったあと(切り株)
      const hsh = ((i * 7919) % 1000) / 1000, machineGap = f.method !== 'direct' && ((i * 2654435761) >>> 0) % 1000 < 15, gone = machineGap || (missSnail && hsh < missSnail * Math.max(0, 1.6 + z * 0.35)) || (missFloat && ((i * 104729) % 1000) / 1000 < missFloat);
      if (s.lodged) { const nz = Math.sin(x * 0.55 + 1.3) + Math.cos(z * 0.42) + 0.5 * Math.sin((x + z) * 1.7); if (nz > 0.1) tilt = Math.min(1.45, 0.45 + 0.55 * nz + 0.15 * j); }   // まだらに倒れる(半分かたむく所から、ぺたんと寝る所まで)
      if (!tilt && tyAfter && f.headDoy) tilt = 0.18 + 0.12 * j;   // 台風のあとは、倒れなかった稲も風下へ少し傾いたまま
      if (s.burn) for (const [bx, bz] of burnAt) if ((x - bx) ** 2 + (z - bz) ** 2 < (1.6 * s.burn) ** 2) { burned = true; hb *= 0.85; }
      if (!lodgeAxis) { lodgeAxis = new THREE.Vector3(-0.94, 0, 0.34).normalize(); qLodge = new THREE.Quaternion(); }
      const wob = f.method !== 'direct' ? 0.025 * Math.sin(z * 0.9 + Math.floor((x + FIELD_W) / 1.2) * 1.7) : 0;   // 田植え機は6条ずつ植えるので、6条ごとに列が少し蛇行する
      E.set((hv - 0.5) * 0.2 * youngV, ry, (hw - 0.5) * 0.2 * youngV); Q.setFromEuler(E); if (tilt) { qLodge.setFromAxisAngle(lodgeAxis, tilt * 0.95); Q.premultiply(qLodge); } P.set(x + wob, 0, z);   // 倒れる向きは風(台風)で決まり、みな同じ向き
      const sp = s.phase === 'harvested' ? 0.35 : s.spread * (0.9 + 0.2 * j) * (1 + (hw - 0.5) * 0.5 * youngV);
      S.set(sp, (cut ? 0.12 : hb) * (0.92 + 0.12 * j) * (1 + (hv - 0.5) * 0.4 * youngV), sp);   /* 植えたては株ごとに背丈・広がり・かたむきがちがう(手植えの補植・苗の本数のちがい) */ if (gone) S.set(0, 0, 0); M.compose(P, Q, S);
      hills.setMatrixAt(i, M);
      if (cut || gone) { S.set(0, 0, 0); M.compose(P, Q, S); } else if (f.headDoy) { const e = clamp((f.doy - f.headDoy + 3 - 5 * j) / 7, 0, 1); if (e < 1) { if (e <= 0) S.set(0, 0, 0); else S.multiplyScalar(0.55 + 0.45 * e); M.compose(P, Q, S); } }   // 出穂は1週間ほどかけて、株ごとに少しずつ穂が出る(出穂期=4〜5割の穂が出た日)
      panicles.setMatrixAt(i, M);
      if (shadows) { const r = (0.18 + 0.2 * sp) * (tilt ? 2 : 1); Q.identity(); P.set(x + wob + (tilt ? 0.25 : 0.06), s.water + 0.004, z - 0.04); S.set(r, 1, r * 1.3); M.compose(P, Q, S); shadows.setMatrixAt(i, M); }
      hills.setColorAt(i, cut ? hsl(42, 0.38, 0.5 + j * 0.06) : burned ? hsl(30, 0.35, 0.36) : leafColor(s, j));
      panicles.setColorAt(i, burned ? hsl(30, 0.3, 0.33) : panicleColor(s, j));
    }
    uniforms.uSen.value = s.phase === 'headed' ? 0.75 * clamp((s.ripe - 0.25) / 0.75, 0, 1) : 0;   // 刈りどきでも上の葉には緑が少し残る
    anthers.visible = panicles.visible && f.headDoy != null && f.doy - f.headDoy <= 7 && !raining;   // 雨の日は花が開かない
    if (anthers.visible) { anthers.instanceMatrix.array.set(panicles.instanceMatrix.array); anthers.instanceMatrix.needsUpdate = true; }
    hills.instanceMatrix.needsUpdate = panicles.instanceMatrix.needsUpdate = true; if (shadows) { shadows.instanceMatrix.needsUpdate = true; shadows.visible = s.phase !== 'harvested'; shadows.material.opacity = raining ? 0.25 : 0.45 * clamp(s.h * 1.4, 0.2, 1); }
    hills.instanceColor.needsUpdate = panicles.instanceColor.needsUpdate = true;
    if (hillsRefl) { const on = s.phase === 'growing' && s.water > 0 && s.h < 0.5 && !f.harvestDoy; hillsRefl.visible = on; hillsRefl.position.y = 2 * s.water; hillsRefl.material.opacity = (raining ? 0.15 : 0.42) * clamp((0.5 - s.h) / 0.15, 0, 1); mud.material.depthWrite = !on; }
    // 奥と隣の田んぼの色: 稲が小さいうちは水・土の色がまざる
    const cover = s.phase === 'harvested' ? 1 : clamp((s.h - 0.15) / 0.5, 0, 1) * clamp(s.spread, 0, 1);
    const far = leafColor(s, 0.5).lerp(panicleColor(s, 0.5), s.phase === 'headed' ? 0.45 : 0);
    { const young = s.water > 0 && s.phase === 'growing' && cover < 0.45, mp = young ? farPlane.userData.dots : farPlane.userData.rows; if (mp && farPlane.material.map !== mp) { farPlane.material.map = mp; farPlane.material.needsUpdate = true; } }
    farPlane.visible = true; farPlane.material.color.copy(farBase.clone().lerp(far, s.water > 0 && s.phase === 'growing' ? 0.75 + 0.25 * cover : 0.25 + 0.75 * cover)).multiplyScalar(0.85);   /* 遠くの株は重なって緑の帯に見える */
    farPlane.material.opacity = s.water > 0 && s.phase === 'growing' ? clamp(0.62 + 1.1 * cover, 0.62, 1) : 1;   /* 稲が小さいうちは条のすじの間に水面(空のうつり)が見える */
    farPlane.position.y = Math.max(0.06, s.water + 0.03) + (s.phase === 'harvested' ? 0.08 : s.h * 0.82 * cover);   // 奥の稲は平面で描く。稲がしげったら平面を群落の上面の高さに上げ、手前の立体の稲となめらかにつなぐ(深水でも水面の下に沈まない)
    sideFields.forEach((m) => { if (m.userData.rot) { m.material.color.copy(rotColor(f.doy)).multiplyScalar(0.9); return; } const c = far.clone(); c.offsetHSL(0, 0, m.userData.shift * 0.2); m.material.color.copy(farBase.clone().lerp(c, 0.2 + 0.8 * clamp(cover + m.userData.shift, 0, 1))).multiplyScalar(0.85);
      const u = m.userData; if (!u.wp) return; const wet = s.water > 0 && s.phase === 'growing', young = wet && cover < 0.45, mp = young ? u.dots : u.rows;
      m.visible = true; if (m.material.map !== mp) { m.material.map = mp; m.material.needsUpdate = true; } m.material.opacity = wet ? clamp(0.4 + 1.2 * clamp(cover + u.shift, 0, 1), 0.4, 1) : 1;
      u.wp.visible = u.mp.visible = wet; if (wet) { m.material.color.copy(farBase.clone().lerp(c, 0.75 + 0.25 * cover)).multiplyScalar(0.85); sideMudMat.color.copy(mud.material.color); } });   /* となりの田も、植えたてのころは苗の間に水面 */
  };

  // ---------- 視点(ドラッグで見回す・ダブルタップで近くへ) ----------
  function placeCamera() {
    const fo = focusKind && FOCUS[focusKind];
    const base = fo || (closeView ? { p: [0, 1.45, 0.85], t: [0, 0.05, -3.2] } : { p: [0, 1.55, 3.1], t: [0, 0.15, -8] }), k = fo ? 0.25 : 1;   // 近くで見ているときは見回しの幅をせまく
    camera.position.set(...base.p);
    camera.lookAt(base.t[0] + Math.sin(yaw) * 8 * k, base.t[1] + pitch * 4 * k, base.t[2]);
  }
  function bindControls() {
    let down = null;
    canvas.style.touchAction = 'pan-y';
    canvas.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY, yaw, pitch }; });
    window.addEventListener('pointerup', () => { down = null; });
    canvas.addEventListener('pointermove', (e) => {
      if (!down || !camera) return;
      yaw = clamp(down.yaw + (e.clientX - down.x) / canvas.clientWidth * 1.2, -0.8, 0.8);
      pitch = clamp(down.pitch - (e.clientY - down.y) / canvas.clientHeight * 0.6, -0.3, 0.35);
      placeCamera(); kick();
    });
    const toggleClose = () => { if (!camera) return; if (focusKind) { focusKind = null; closeView = false; } else closeView = !closeView; yaw = pitch = 0; placeCamera(); kick(); if (F3.onFocus) F3.onFocus(null); };
    let touchToggled = 0;
    // ちびの農家さんをタップすると、手をふってくれる(作業はさまたげない・文字なし)
    { const rc = new THREE.Raycaster(), nd = new THREE.Vector2(); let dn = null;
      canvas.addEventListener('pointerdown', (e) => { dn = { x: e.clientX, y: e.clientY }; });
      canvas.addEventListener('click', (e) => { if (!camera || !chibi || !chibi.visible || !dn || Math.hypot(e.clientX - dn.x, e.clientY - dn.y) > 8) return; const r = canvas.getBoundingClientRect(); nd.set((e.clientX - r.left) / r.width * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1); rc.setFromCamera(nd, camera);
        if (rc.intersectObject(chibi, true).length) { chibi.userData.waveUntil = performance.now() / 1000 + 2.4; kick(); if (F3.onChibiTap) F3.onChibiTap(); } }); }
    canvas.addEventListener('dblclick', () => { if (performance.now() - touchToggled < 600) return; toggleClose(); });   /* 指の2回タップで切りかえた直後の dblclick(Androidは両方来る)は無視 */
    // スマホ: dblclick が来ない機種(iPhone など)があるので、指の2回タップを自分で見る(350ms以内・30px以内・動かしていない)
    let tap = null, tapStart = null;
    canvas.addEventListener('pointerdown', (e) => { if (e.pointerType !== 'mouse') tapStart = { x: e.clientX, y: e.clientY, t: performance.now() }; });
    canvas.addEventListener('pointerup', (e) => {
      if (e.pointerType === 'mouse' || !tapStart) return;
      const moved = Math.hypot(e.clientX - tapStart.x, e.clientY - tapStart.y) > 12 || performance.now() - tapStart.t > 300; tapStart = null; if (moved) { tap = null; return; }
      const now = performance.now();
      if (tap && now - tap.t < 350 && Math.hypot(e.clientX - tap.x, e.clientY - tap.y) < 30) { tap = null; e.preventDefault(); touchToggled = performance.now(); toggleClose(); }
      else tap = { x: e.clientX, y: e.clientY, t: now };
    });
    canvas.addEventListener('pointercancel', () => { tap = tapStart = null; });
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', '田んぼのようす(ドラッグで見回し、ダブルタップで近くへ)');
  }

  // ---------- 描画ループ(画面に見えている間だけ・約30fps) ----------
  let rafId = 0, enabled = false, onScreen = true, lastSize = '';
  const tmpM = () => new THREE.Matrix4();
  function frame(t) {
    rafId = 0;
    if (!running) return;
    if (document.hidden || !onScreen || canvas.offsetParent === null) { running = false; stats.lastAt = 0; return; } // 休止。再開したときの間隔は数えない
    rafId = requestAnimationFrame(frame);
    if (t - lastFrame < 33) return; lastFrame = t;
    const sec = t / 1000;
    uniforms.uTime.value = sec;
    if (rain.visible) rain.position.y = -((sec * 9) % 7);
    if (water.visible) water.material.normalMap.offset.set(sec * 0.012, sec * 0.007);
    if (sparrows && sparrows.visible) sparrows.children.forEach((b, i) => {
      const fl = b.userData.fly, wl = b.getObjectByName('wl'), wr = b.getObjectByName('wr'), hd = b.getObjectByName('head');
      if (fl) {   // 田の上を低く回って飛ぶ。羽ばたき
        const a = sec * 1.4 + fl.ph; b.position.set(fl.cx + Math.cos(a) * fl.r, b.userData.y0 + 0.3 + 0.08 * Math.sin(a * 3), fl.cz + Math.sin(a) * fl.r * 0.5); b.rotation.set(0, Math.atan2(-Math.sin(a), Math.cos(a) * 0.5), 0);
        const fp = Math.sin(sec * 28 + i) * 0.9; wl.rotation.z = 1.2 + fp; wr.rotation.z = -1.2 - fp;
      } else {    // 穂の上でちょんちょん跳ねて、ついばむ
        b.position.y = b.userData.y0 + Math.max(0, Math.sin(sec * 5 + i * 1.7)) * 0.02; b.rotation.y += 0.004 * Math.sin(sec + i);
        hd.rotation.x = Math.max(0, Math.sin(sec * 3.2 + i * 2.1)) * 0.7; wl.rotation.z = wr.rotation.z = 0;
      }
    });
    if (leakHole && leakHole.visible) { leakHole.userData.stream.offset.x = -sec * 0.9; const w = leakHole.getObjectByName('whirl'); if (w) w.rotation.z = sec * 2.5; leakHole.userData.cray.children.forEach((c) => { if (c.name === 'claw') c.rotation.x = 0.15 * Math.sin(sec * 1.5); }); }
    if (valve) { const j = valve.getObjectByName('jet'); if (j && j.visible) { j.scale.x = j.scale.z = 1 + 0.08 * Math.sin(sec * 23); valve.getObjectByName('foam').scale.setScalar(1 + 0.1 * Math.sin(sec * 9)); } }
    tHerons.forEach((h, i) => { if (!h.visible) return; const hd = h.getObjectByName('head'), st = Math.max(0, Math.sin(sec * 0.8 + i * 2.1) - 0.85) * 7; if (hd) { hd.position.set(0, 0.96 - 0.25 * st, 0.21 + 0.12 * st); hd.rotation.x = 0.9 * st; } });
    if (handPlanter && handPlanter.visible) { const a = handPlanter.getObjectByName('arm'); if (a) a.rotation.x = -0.25 + 0.35 * Math.max(0, Math.sin(sec * 1.6)); }   /* 苗を1株ずつ押しこむ */
    if (chibi && chibi.visible) {   // ちびの農家さん: 息・まばたき・その旬の作業を、ゆっくり
      const u = chibi.userData, md = u.mode, body = chibi.getObjectByName('body'), head = chibi.getObjectByName('head'), aR = chibi.getObjectByName('armR'), aL = chibi.getObjectByName('armL'), lL = chibi.getObjectByName('legL'), lR = chibi.getObjectByName('legR');
      const br = Math.sin(sec * 2.1), bl = (sec % 3.7) < 0.14 ? 0.12 : 1; body.position.y = 0.006 * br; body.scale.set(1, 1 + 0.015 * br, 1);
      head.children.forEach((c) => { if (c.name === 'eye') c.scale.y = 0.017 * bl; }); head.rotation.z = 0.06 * Math.sin(sec * 0.5);
      let bend = 0, ar = 0, al = 0, ay = 0, walk = 0;
      if (md === 'can') { ar = -0.9 + 0.12 * Math.sin(sec * 1.2); bend = 0.15; chibi.getObjectByName('can').rotation.x = 0.5 + 0.2 * Math.sin(sec * 1.2); }
      else if (md === 'plant') { const c = (Math.sin(sec * 1.3) + 1) / 2; bend = 0.35 + 0.2 * c; ar = -0.6 - 0.9 * c; al = -0.3; }
      else if (md === 'weed') { const c = (Math.sin(sec * 1.6) + 1) / 2; bend = 0.35 + 0.12 * c; ar = -1.2 + 0.5 * c; al = -1.0 + 0.4 * (1 - c); }
      else if (md === 'kama') { const c = (Math.sin(sec * 1.5) + 1) / 2; bend = 0.3 + 0.08 * c; ar = -1.1; ay = -0.8 + 1.4 * c; al = -0.9; }
      else if (md === 'ami') { ar = -1.0; ay = 0.9 * Math.sin(sec * 2.2); al = -0.2; }
      else if (md === 'taba') { al = -1.2; ar = -0.4 + 0.25 * Math.sin(sec * 1.8); }
      else if (md === 'kasa') { ar = -0.2 + 0.05 * Math.sin(sec); al = -0.15; head.rotation.x = 0.1; }   /* 笠をかぶって雨をながめる */
      else if (md === 'rest') { const c = Math.max(0, Math.sin(sec * 0.6)); ar = -0.4 - 1.8 * c * c; al = -0.3; head.rotation.x = -0.25 * c * c; }   /* すわって水筒のお茶をひと口 */
      else if (md === 'look') { ar = -2.2 + 0.08 * Math.sin(sec * 0.9); head.rotation.x = -0.12; }   /* 手をおでこにかざして稲をながめる */
      else if (md === 'walk') { walk = Math.sin(sec * 3.0); chibi.position.x = u.x0 + 0.5 * Math.sin(sec * 0.25); ar = 0.35 * walk; al = -0.35 * walk; }
      if (u.pa && sec - u.pa.t0 > 3.2) { u.pa = null; if (u.bub) u.bub.visible = false; }
      if (u.pa) {   /* 見回りで手を打つ: その場で作業して、✅でぴょん(文字なしで「できた」がわかる) */
        const t = sec - u.pa.t0, bub = u.bub, A = u.pa.act; bend = ar = al = ay = walk = 0; head.rotation.x = 0; chibi.position.x = u.pa.x; chibi.rotation.y += (0.8 - chibi.rotation.y) * 0.15;
        if (t < 2.0) { const c = (Math.sin(t * 7) + 1) / 2;
          if (A === 'stomp') { walk = Math.sin(t * 9); bend = 0.1; ar = -0.5; al = -0.5; }   /* 穴をふさいで踏み固める */
          else if (A === 'tape') { ar = -2.4 + 0.3 * c; al = -2.4 + 0.3 * (1 - c); }   /* テープを高く張る */
          else { bend = 0.35 + 0.15 * c; ar = -1.2 + 0.6 * c; al = -1.0 + 0.4 * (1 - c); }   /* かがんで抜く・とる */
          if (bub) bub.visible = false; }
        else { const h = Math.max(0, Math.sin((t - 2.0) * 9)); chibi.position.y = u.y0 + 0.025 * h; ar = -2.6; al = -2.6;
          if (bub) { if (bub.userData.ic !== '✅') { const c = bub.userData.cv.getContext('2d'); c.clearRect(0, 0, 128, 128); c.fillStyle = '#fffdf6'; c.strokeStyle = '#7aa95c'; c.lineWidth = 6; c.beginPath(); c.arc(64, 56, 46, 0, Math.PI * 2); c.fill(); c.stroke(); c.beginPath(); c.moveTo(52, 98); c.lineTo(64, 124); c.lineTo(76, 98); c.fill(); c.font = '56px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('✅', 64, 60); bub.userData.tx.needsUpdate = true; bub.userData.ic = '✅'; }
            bub.visible = true; bub.scale.setScalar(0.42); bub.position.set(u.pa.x + 0.04, u.y0 + 0.98, chibi.position.z); } }
      } else
      if (u.pw) {   /* 見回り: 畦を歩いて、見つけた所で止まり、ふきだしで知らせる */
        bend = ar = al = ay = walk = 0; head.rotation.x = 0;
        const t = sec - u.pw.t0, st = u.pw.stops, bub = u.bub; let k = st.findIndex((x) => t < x.t1), x;
        if (k < 0) { x = st.length ? st[st.length - 1].x : u.pw.x0; if (t > u.pw.end) { u.pw = null; bub.visible = false; } else { ar = -0.3; al = -2.6; aL.rotation.z = -0.4 * Math.sin(sec * 8); } }   /* おわり: 手をふる */
        else { const s0 = st[k], xa = k ? st[k - 1].x : u.pw.x0;
          if (t < s0.ta) { const q = Math.max(0, (t - (k ? st[k - 1].t1 : 0)) / Math.max(0.01, s0.ta - (k ? st[k - 1].t1 : 0))); x = xa + (s0.x - xa) * (q * q * (3 - 2 * q)); walk = Math.sin(sec * 7); ar = 0.4 * walk; al = -0.4 * walk; chibi.rotation.y += ((s0.x >= xa ? 1.25 : -1.25) - chibi.rotation.y) * 0.2; bub.visible = false; }
          else { x = s0.x; chibi.rotation.y += (0.35 - chibi.rotation.y) * 0.15; if (s0.bad) { ar = -1.35; bend = 0.18; chibi.position.y = u.y0; } else { const h = Math.max(0, Math.sin((t - s0.ta) * 9)); chibi.position.y = u.y0 + 0.02 * h; al = -0.6; ar = -0.6; }   /* 気になる物は指さす・生き物はぴょん */
            if (bub.userData.ic !== s0.ic) { const c = bub.userData.cv.getContext('2d'); c.clearRect(0, 0, 128, 128); c.fillStyle = '#fffdf6'; c.strokeStyle = s0.bad ? '#d9822b' : '#7aa95c'; c.lineWidth = 6; c.beginPath(); c.arc(64, 56, 46, 0, Math.PI * 2); c.fill(); c.stroke(); c.beginPath(); c.moveTo(52, 98); c.lineTo(64, 124); c.lineTo(76, 98); c.fill(); if (s0.ic.startsWith('<svg')) { const im = new Image(), tx = bub.userData.tx; im.onload = () => { c.drawImage(im, 20, 12, 88, 88); tx.needsUpdate = true; }; im.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(s0.ic.replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ').replace('width="1em" height="1em"', 'width="64" height="64"')); } else { const two = [...s0.ic.replace(/\uFE0F/g, '')].length > 1; c.font = (two ? 40 : 56) + 'px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = '#000'; c.fillText(s0.ic, 64, 60); } bub.userData.tx.needsUpdate = true; bub.userData.ic = s0.ic; }
            const g = Math.min(1, (t - s0.ta) / 0.25); bub.visible = true; bub.scale.setScalar(0.42 * (0.6 + 0.4 * g)); } }
        chibi.position.x = x; if (bub.visible) bub.position.set(x + 0.04, u.y0 + 0.98, chibi.position.z);
      } else
      if (md !== 'walk') { const tg = md === 'can' ? 1.35 : md === 'plant' || md === 'weed' || md === 'kama' ? 0.8 : 0.35; chibi.rotation.y += (tg - chibi.rotation.y) * 0.08; }   /* かがむ作業は横向き(顔が見える) */ else { const tgt = Math.cos(sec * 0.25) >= 0 ? 1.2 : -1.2; chibi.rotation.y += (tgt - chibi.rotation.y) * 0.1; }   /* 向きをかえるのも、なめらかに */
      if (md !== 'look') head.rotation.x = 0;
      head.rotation.x += -bend * 0.9; const ht = chibi.getObjectByName('hat'); if (ht) ht.rotation.x = -bend * 0.5;   /* かがんでも顔は前を向く(帽子で顔がかくれない) */
      if (u.waveUntil && sec < u.waveUntil) { const k = Math.min(1, (u.waveUntil - sec) / 0.4, (sec - u.waveUntil + 2.4) / 0.4); bend *= 1 - k; al = al * (1 - k) - 2.7 * k; aL.rotation.z = -0.5 * k * Math.sin(sec * 9); head.rotation.z += 0.15 * k; }   /* 手をふる(ゆっくり入って、ゆっくりもどる) */ else aL.rotation.z = 0;
      { const tb = chibi.getObjectByName('tombo'); if (tb && tb.visible) { const fl = Math.sin(sec * 0.7) > 0.93; tb.children.forEach((c) => { if (c.name === 'wing') c.rotation.z = fl ? 0.5 * Math.sin(sec * 40) : 0.0; }); tb.position.y = 0.12 + (fl ? 0.015 : 0); } }   /* ときどき羽をふるわせる */
      { const kr = chibi.getObjectByName('kaeru'); if (kr && kr.visible && md === 'kasa') kr.scale.set(1, 1 + 0.12 * Math.max(0, Math.sin(sec * 1.7)), 1); }   /* のどをふくらませる */
      body.rotation.x = bend; aR.rotation.x = ar; aR.rotation.y = ay; aL.rotation.x = al; lL.rotation.x = md === 'rest' && !u.pw && !u.pa ? -1.4 : 0.4 * walk; lR.rotation.x = md === 'rest' && !u.pw && !u.pa ? -1.4 : -0.4 * walk; if (!u.pa && (!u.pw || walk)) chibi.position.y = u.y0 + (md === 'walk' || u.pw ? 0.006 * Math.abs(walk) : md === 'rest' ? -0.07 : 0);
    }
    if (farmer && farmer.visible) { const n = farmer.getObjectByName('net'); if (n && n.visible) n.rotation.y = n.userData.base + 0.7 * Math.sin(sec * 3.2); }   // 網を左右にふる
    if (ripples && ripples.visible) { const MR = tmpM(), PR = new THREE.Vector3(), QR = new THREE.Quaternion(), SR = new THREE.Vector3(); ripples.userData.p.forEach(([x, z, ph], i) => { const t = (sec * 0.9 + ph) % 1, r = 0.02 + 0.16 * t; PR.set(x, 0, z); SR.set(r, 1, r); MR.compose(PR, QR, SR); ripples.setMatrixAt(i, MR); }); ripples.instanceMatrix.needsUpdate = true; }   // 輪がひろがる
    if (lifeG.cray && lifeG.cray.visible) lifeG.cray.children.forEach((g, i) => { const u = g.userData, t = sec * 0.12 + i * 3; g.position.x = u.x + 0.12 * Math.sin(t); g.position.z = u.z + 0.05 * Math.sin(t * 0.7); g.rotation.y = u.r + 0.4 * Math.cos(t); g.children.forEach((c) => { if (c.name === 'claw') c.position.y = 0.003 + 0.004 * Math.max(0, Math.sin(sec * 0.9 + i)); }); });   /* のそのそ・ときどき はさみを上げる */
    if (lifeG.dojo && lifeG.dojo.visible) { const b = lifeG.dojo.getObjectByName('body'), t = sec; b.rotation.x = -0.42 + 0.07 * Math.sin(t * 1.3); b.position.y = 0.006 + 0.004 * Math.sin(t * 1.3); b.rotation.z = 0.12 * Math.sin(t * 0.9); const h = lifeG.dojo.getObjectByName('hello'); if (h.visible) h.position.y = 0.06 + 0.004 * Math.sin(t * 4); }   /* 水面から顔を出して、ゆらゆら */
    if (lifeG.bull && lifeG.bull.visible) lifeG.bull.children.forEach((g, i) => { g.position.y = 0.002 * Math.sin(sec * 0.6 + i); });   /* 水面でゆっくり浮き沈み */
    if (lifeG.gen && lifeG.gen.visible) lifeG.gen.children.forEach((g, i) => { const u = g.userData, t = sec * 0.5 + i * 1.9; g.position.x = u.x + 0.08 * Math.sin(t); g.position.z = u.z + 0.06 * Math.sin(t * 1.3); g.rotation.y = Math.atan2(Math.cos(t) * 0.08, Math.cos(t * 1.3) * 0.078); g.position.y = -0.004 - 0.006 * Math.max(0, Math.sin(t * 0.4)); });   /* すいすい・ときどきもぐる */
    if (lifeG.strider && lifeG.strider.visible) lifeG.strider.children.forEach((g, i) => { g.position.x += 0.003 * Math.sin(sec * 0.7 + i * 2); g.position.z += 0.002 * Math.cos(sec * 0.5 + i); });   // アメンボはすいすい
    if (heron.visible) {   // そろそろ歩き、ときどき首をのばして水面をつつく
      const ph = sec * 0.35, step = Math.sin(sec * 1.1); heron.position.x = 1.9 + 0.4 * Math.sin(ph); heron.position.z = -4.2 + 0.25 * Math.cos(ph * 0.7); heron.rotation.y = -0.6 + 0.5 * Math.cos(ph);
      const L = heron.getObjectByName('legL'), R = heron.getObjectByName('legR'); if (L) { L.rotation.x = 0.25 * Math.max(0, step); R.rotation.x = 0.25 * Math.max(0, -step); }
      const h = heron.getObjectByName('head'), strike = Math.max(0, Math.sin(sec * 0.45) - 0.92) * 12; if (h) { h.position.set(0, 0.96 - 0.25 * strike, 0.21 + 0.12 * strike); h.rotation.x = 0.9 * strike; } }
    if (swallows.visible) {
      const M = tmpM(), Q = new THREE.Quaternion(), E = new THREE.Euler(), P = new THREE.Vector3(), S1 = new THREE.Vector3(1, 1, 1);
      for (let i = 0; i < swallows.count; i++) { const a = sec * (0.9 + i * 0.13) + i * 1.7, r = 3 + i; P.set(Math.sin(a) * r, 0.6 + 0.35 * Math.sin(a * 2.3 + i), -4 - i * 1.5 + Math.cos(a) * r * 0.6); E.set(0.2 * Math.sin(a * 4), a + Math.PI, 0.5 * Math.cos(a)); Q.setFromEuler(E); M.compose(P, Q, S1); swallows.setMatrixAt(i, M); }
      swallows.instanceMatrix.needsUpdate = true;
    }
    if (showFlies) {
      const M = tmpM(), Q = new THREE.Quaternion(), E = new THREE.Euler(), P = new THREE.Vector3(), S1 = new THREE.Vector3(1, 1, 1);
      for (let i = 0; i < flies.count; i++) { const a = sec * (0.4 + i * 0.03) + i; E.set(0, a * 2 + Math.PI / 2, 0); Q.setFromEuler(E); P.set(Math.sin(a) * (2 + i % 4) + (i % 5) - 2, 1.2 + 0.4 * Math.sin(a * 3 + i), -2 - (i % 7) - Math.cos(a) * 1.5); M.compose(P, Q, S1); flies.setMatrixAt(i, M); }
      flies.instanceMatrix.needsUpdate = true;
    }
    try {
      resize(); const t0 = performance.now(); renderer.render(scene, camera); const dt = performance.now() - t0;
      // 実際に3Dを描いた回数・かかった時間・間隔(ページ全体のコマではなく田んぼの描画)
      stats.renders++; stats.renderMs += dt; if (stats.lastAt && t - stats.lastAt < 1000) stats.interval = stats.interval ? stats.interval * 0.9 + (t - stats.lastAt) * 0.1 : t - stats.lastAt; stats.lastAt = t;
      if (stats.firstAfterUpdate == null && stats.updatedAt) stats.firstAfterUpdate = performance.now() - stats.updatedAt;
      // 描画が遅い(平均55ms超・60回以上)なら一度だけ画質を下げる
      if (quality === 'high' && stats.renders > 60 && stats.interval > 55) F3.setQuality('low');
    } catch (e) { fail(e); }
  }
  function kick() { if (enabled && !running && renderer) { running = true; rafId = requestAnimationFrame(frame); } }
  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight, dpr = Math.min(window.devicePixelRatio || 1, QUALITY[quality].dpr), key = w + 'x' + h + '@' + dpr;
    if (key === lastSize || !w || !h) return;
    lastSize = key; renderer.setPixelRatio(dpr); renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  F3.start = function () { enabled = true; kick(); };
  // 見回りで見つけたもの(畦の穴・ヒエ・スズメ・ナガエツルノゲイトウ)の近くへ。ダブルタップか次の旬でもとの景色へ
  F3.canFocus = (kind) => !!FOCUS[kind];
  /* 見回りで手を打った: その場で作業の姿 → ✅ (i=何番目に見つけた物か) */
  F3.patrolDo = function (i, act) { if (!chibi || !chibi.visible) return false; const u = chibi.userData, st = u.pw ? u.pw.stops : u.lastStops; const x = st && st[i] ? st[i].x : chibi.position.x; u.pw = null; u.pa = { t0: performance.now() / 1000, act, x }; kick(); return true; };
  /* 見回りの歩き: list = [{ ic: '🕳️', bad: true }, …]。止まる時刻(秒)を返す(画面の絵カードを同じ時刻に出す) */
  F3.patrolWalk = function (list) {
    if (!chibi || !chibi.visible || !camera) return null; const u = chibi.userData, n = list.length, x0 = chibi.position.x, stops = []; let t = 0, px = x0;
    const L = n ? list : [{ ic: '🌾', bad: false }];
    L.forEach((e, i) => { const x = L.length === 1 ? 0.45 : -0.55 + 1.7 * i / (L.length - 1);   /* 窓の左はしから右へ(画面に入る範囲) */ const ta = t + Math.max(0.6, Math.abs(x - px) / 0.7); t = ta + 1.6; stops.push({ ic: e.ic, bad: !!e.bad, x, ta, t1: t }); px = x; });
    u.pw = { t0: performance.now() / 1000, x0, stops, end: t + 1.6 }; u.lastStops = stops; u.waveUntil = 0; kick(); return stops.map((s) => s.ta);
  };
  F3.chibiScreen = () => { if (!chibi || !camera) return null; const v = chibi.position.clone(); v.y += 0.3; v.project(camera); const r = canvas.getBoundingClientRect(); return { x: r.left + (v.x + 1) / 2 * r.width, y: r.top + (1 - v.y) / 2 * r.height }; };   /* テスト用: 農家さんの画面上の位置 */
  F3.debugChibi = (m, tombo) => { if (chibi) { chibi.userData.force = m || null; chibi.userData.forceTombo = !!tombo; if (lastFarm) F3.update(lastFarm); } };   /* 画面確認用: 作業の姿を決めて見る */
  F3.snapshot = () => { if (!renderer || !scene || !camera) return null; try { renderer.render(scene, camera); return renderer.domElement; } catch (e) { return null; } };   /* 投稿用: 描いた直後の田んぼ(同じ流れの中で drawImage する) */
  F3.focus = function (kind) {
    if (!camera || !FOCUS[kind]) return false;
    focusKind = kind; focusDoy = lastFarm ? lastFarm.doy : -1; closeView = false; yaw = pitch = 0; placeCamera(); kick(); return true;
  };
  F3.setQuality = function (q) {
    if (!QUALITY[q] || q === quality) return; quality = q; lastSize = ''; layoutKey = layoutKey ? layoutKey + '!' : ''; // 次の描画で並べ直す
    if (panicles) panicles.userData.droop = -1;
    if (lastFarm) F3.update(lastFarm);
  };
  F3.stop = function () { enabled = false; running = false; stats.lastAt = 0; if (rafId) cancelAnimationFrame(rafId); rafId = 0; };
  // 失敗したら資源を捨てて、呼び出し側に知らせる(呼び出し側はキャンバスを差し替えて2Dに)
  function fail(e) { console.error('3Dの田んぼを止めました', e); F3.dispose(); if (F3.onFail) F3.onFail(e); }
  F3.dispose = function () {
    F3.stop();
    if (scene) scene.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) { (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => { for (const k of ['map', 'normalMap']) if (m[k]) m[k].dispose(); m.dispose(); }); } });
    for (const t of [envClear, envRain, grainTex, blobTex, texMud, texDry, texDryFine, texTill, waterNormal]) if (t) t.dispose();
    if (pmrem) pmrem.dispose();
    if (renderer) { renderer.dispose(); if (renderer.forceContextLoss) renderer.forceContextLoss(); }
    renderer = null; scene = null; camera = null; hills = panicles = anthers = null; antherTex = null; layoutKey = ''; hillPos = []; sideFields = []; clouds = [];
    envClear = envRain = grainTex = blobTex = pmrem = texMud = texDry = texDryFine = texTill = waterNormal = null; shadows = null;
  };

  F3.init = function (cv) {
    THREE = window.THREE;
    if (!THREE) return false;
    try {
      canvas = cv;
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'low-power' });
    } catch (e) { renderer = null; return false; }
    // 非力そうな端末(タッチ操作で、CPUのコアかメモリが少ない)は最初から low
    const coarse = window.matchMedia && matchMedia('(pointer: coarse)').matches;
    if (coarse && ((navigator.hardwareConcurrency || 8) <= 4 || (navigator.deviceMemory || 8) <= 4)) quality = 'low';
    try {
      renderer.outputEncoding = THREE.sRGBEncoding;
      renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
      scene = new THREE.Scene();
      scene.fog = new THREE.FogExp2(lin(SKY.clear.hor), 0.0042);
      camera = new THREE.PerspectiveCamera(46, 16 / 10, 0.05, 2000);
      hemi = new THREE.HemisphereLight(lin('#dfeaf5'), lin('#6b5a3a'), 0.9); scene.add(hemi);
      sun = new THREE.DirectionalLight(lin('#fff4e0'), 2.2); sun.position.set(-8, 14, 6); scene.add(sun);
      buildSky(); buildScenery(); buildEnv(); placeCamera(); bindControls();
    } catch (e) { console.error(e); F3.dispose(); return false; }
    canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); fail(new Error('WebGLのコンテキストが失われました')); });
    if ('IntersectionObserver' in window) new IntersectionObserver((es) => { onScreen = es[0].isIntersecting; if (onScreen) kick(); }).observe(canvas);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) kick(); });
    enabled = true; kick();
    return true;
  };
  // 検証用: 最後に描いたフレームの情報
  F3.debugInfo = function () {
    if (!renderer) return { active: false };
    const gl = renderer.getContext(), ext = gl.getExtension('WEBGL_debug_renderer_info');
    return { active: true, running, enabled, onScreen, rafPending: !!rafId, hidden: document.hidden, visibleCanvas: canvas.offsetParent !== null, quality, renders: stats.renders, avgRenderMs: stats.renders ? +(stats.renderMs / stats.renders).toFixed(2) : null, intervalMs: +stats.interval.toFixed(1), firstAfterUpdateMs: stats.firstAfterUpdate == null ? null : +stats.firstAfterUpdate.toFixed(1), triangles: renderer.info.render.triangles, calls: renderer.info.render.calls, geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures,
      hills: hills ? hills.count : 0, dpr: renderer.getPixelRatio(), size: [canvas.width, canvas.height], gpu: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER) };
  };
  window.Field3D = F3;
})();
