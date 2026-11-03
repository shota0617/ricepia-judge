// 転がりの同期（M1）：回転角＝移動距離÷半径。半径 R=0.42 マス、円周 2πR≒2.639 マスで ちょうど1回転。
// 純関数だけ（DOM・保存・ポイントには触らない）。dx, dy は1こまの移動量（マス）。
(function (root) {
  const R = 0.42;
  const num = v => (typeof v === 'number' && isFinite(v) ? v : 0);
  const effR = scale => R * (typeof scale === 'number' && isFinite(scale) && scale > 0 ? scale : 1);
  function advance(dx, dy, scale) {
    try {
      const x = num(dx), y = num(dy), r = effR(scale);
      return { dAng: x / r, dPitch: y / r, dist: Math.hypot(x, y) };
    } catch (e) { return { dAng: 0, dPitch: 0, dist: 0 }; }
  }
  function turnsFor(dist, scale) {
    try {
      const d = num(dist);
      return d / (2 * Math.PI * effR(scale));
    } catch (e) { return 0; }
  }
  function frameFor(dist, scale) {
    const f = Math.floor(turnsFor(dist, scale) * 8) % 8;
    return f < 0 ? f + 8 : f;
  }
  // 方向転換（M3）：向きの変わり方は TURN_PER_SEC rad/秒まで。速さは変えず、向きだけを上限の角度まで回す（弧を描いて曲がる）。
  const TURN_PER_SEC = 5.5;
  function limitTurn(vx, vy, pvx, pvy, maxRad) {
    try {
      const x = num(vx), y = num(vy), px = num(pvx), py = num(pvy);
      const sp = Math.hypot(x, y), psp = Math.hypot(px, py);
      if (sp < 0.05 || psp < 0.05 || typeof maxRad !== 'number' || !isFinite(maxRad) || maxRad < 0) return { vx: x, vy: y };
      const cross = px * y - py * x, dot = px * x + py * y;
      const diff = Math.atan2(cross, dot);   // 前の向き→新しい向きの符号つき角度（最短弧）
      if (Math.abs(diff) <= maxRad) return { vx: x, vy: y };
      const turn = diff === -Math.PI || diff === Math.PI ? maxRad : Math.sign(diff) * maxRad;   // ちょうど反対は + 側へ（決定的に）
      const target = Math.atan2(py, px) + turn, c = Math.cos(target), s = Math.sin(target);
      return { vx: sp * c, vy: sp * s };
    } catch (e) { return { vx: 0, vy: 0 }; }
  }
  // 地面の感じ（M4）：地区ごとに ころがり抵抗(crr)と 速さ比例の減り(lin)の 倍率を少しずつ変える（0.8〜1.3。港は よく転がり、茶畑・砂の島は 少し重い）
  const AREA_FEEL = {
    isshiki: { crr: 0.82, lin: 0.85 },
    kira: { crr: 0.95, lin: 0.97 },
    hazu: { crr: 1.12, lin: 1.08 },
    nishio: { crr: 1.18, lin: 1.10 },
    sakushima: { crr: 1.28, lin: 1.15 }
  };
  for (const k in AREA_FEEL) Object.freeze(AREA_FEEL[k]);
  Object.freeze(AREA_FEEL);   // 公開しても書きかえられない（純関数の前提を守る。Codexレビュー指摘）
  function groundFeel(areaId) {
    try {
      const f = typeof areaId === 'string' && Object.prototype.hasOwnProperty.call(AREA_FEEL, areaId) ? AREA_FEEL[areaId] : null;
      return f ? { crr: f.crr, lin: f.lin } : { crr: 1, lin: 1 };
    } catch (e) { return { crr: 1, lin: 1 }; }
  }
  // 眺めるコロコロ（M5）：無操作が IDLE_START 秒続くと、近くの名所（目的地があればそこ）へ 歩くより おそい 一定の速さ IDLE_SPEED で ゆっくり 転がり続ける。
  // 向かう力 IDLE_ACC は ころがり抵抗より 大きい。速さが IDLE_SPEED に 届いたら 力は 0（あおらない・せかさない）。
  const IDLE_START = 8, IDLE_SPEED = 1.4, IDLE_ACC = 5;
  const fin = v => typeof v === 'number' && isFinite(v);
  function idleDue(sec, hasInput) {
    try { return fin(sec) && sec >= IDLE_START && hasInput !== true && !hasInput; } catch (e) { return false; }
  }
  function idleTarget(mx, my, spots, excludeKey) {
    try {
      if (!fin(mx) || !fin(my) || !Array.isArray(spots)) return null;
      const ex = Array.isArray(excludeKey) ? excludeKey : [excludeKey];   // 除外は 1件でも 複数（配列）でもよい（近くの到着済みを まとめて外す）
      let best = null;
      for (const s of spots) {
        if (!s || !fin(s.x) || !fin(s.y)) continue;
        const key = typeof s.key === 'string' ? s.key : s.x + ',' + s.y;
        if (ex.indexOf(key) >= 0) continue;
        const dist = Math.hypot(s.x - mx, s.y - my);
        if (!best || dist < best.dist) best = { x: s.x, y: s.y, key, dist };   // 近い点も候補にする（距離で外すと 到着判定(1.5)との間で 目標が 行き来して 止まる。ドライバの数値検証で確認）
      }
      return best;
    } catch (e) { return null; }
  }
  // 目的地の次は 名所めぐり（第4弾サイクル29：Flower の 花から 花へ。目的地は 最初の 1つで、着いたら skip に ためて 近くの 名所へ 転がり続ける）
  function nextIdleTarget(mx, my, guide, spots, skip) {
    try {
      if (!fin(mx) || !fin(my)) return null;
      const ex = Array.isArray(skip) ? skip : [skip];
      if (guide && typeof guide === 'object' && fin(guide.x) && fin(guide.y)) {
        const key = typeof guide.key === 'string' ? guide.key : guide.x + ',' + guide.y;
        if (ex.indexOf(key) < 0) return { x: guide.x, y: guide.y, key, dist: Math.hypot(guide.x - mx, guide.y - my), guide: true };
      }
      const t = idleTarget(mx, my, spots, ex);
      return t ? { x: t.x, y: t.y, key: t.key, dist: t.dist, guide: false } : null;
    } catch (e) { return null; }
  }
  // 届かなかった 名所は その回のあいだ 覚える（第4弾サイクル33：ABZÛ の 流れ。行き止まりでも 止まらず 次へ。skip を 解放しても fails は 残る）
  function idleNoteFail(fails, key) {
    try {
      const a = Array.isArray(fails) ? fails.filter(k => typeof k === 'string') : [];
      if (typeof key !== 'string') return a;
      if (a.indexOf(key) < 0) a.push(key);
      return a;   // 上限で 古いものを 落とさない：落とすと 一巡の 再開で 届かない 名所が 復活する（Codexレビュー指摘）
    } catch (e) { return []; }
  }
  function idleExclude(skip, fails) {
    try {
      const out = [];
      for (const list of [skip, fails]) {
        if (!Array.isArray(list)) continue;
        for (const k of list) if (typeof k === 'string' && out.indexOf(k) < 0) out.push(k);
      }
      return out;
    } catch (e) { return []; }
  }
  function idleFailed(fails, key) {
    try { return Array.isArray(fails) && fails.indexOf(key) >= 0; } catch (e) { return false; }
  }
  function idleForce(mx, my, tx, ty, vx, vy) {
    try {
      if (![mx, my, tx, ty].every(fin)) return { fx: 0, fy: 0, dist: 0, arrived: true };
      const dx = tx - mx, dy = ty - my, dist = Math.hypot(dx, dy);
      if (dist < 1.5) return { fx: 0, fy: 0, dist, arrived: true };
      const ux = dx / dist, uy = dy / dist;
      const along = num(vx) * ux + num(vy) * uy;
      if (along >= IDLE_SPEED) return { fx: 0, fy: 0, dist, arrived: false };
      if (along >= 0 && Math.hypot(num(vx), num(vy)) >= IDLE_SPEED * 1.5) return { fx: 0, fy: 0, dist, arrived: false };   // 坂などで すでに じゅうぶん 速いときは あおらない（Codexレビュー指摘）
      return { fx: ux * IDLE_ACC, fy: uy * IDLE_ACC, dist, arrived: false };
    } catch (e) { return { fx: 0, fy: 0, dist: 0, arrived: true }; }
  }
  // 影の のび と フレームレートの 見はり（第4弾サイクル25：仕上げ。速いと 影が 進む 向きへ のびる・重い 端末は 飾りを 落として 60fps を 守る）
  const FPS_SLOW = 42, FPS_MIN = 90, FPS_RECOVER = 48;   // 飾りを 落とす 境界（42）と もどす 境界（48）を ずらす：境界の 近くで 出たり 消えたりを くり返さない
  function shadowStretch(v) {
    if (typeof v !== 'number' || !isFinite(v)) return 1;
    if (v <= 1.5) return 1;
    return Math.min(1.3, 1 + (v - 1.5) * 0.05);
  }
  function fpsStep(state, dtMs) {
    const ok = state && typeof state === 'object' && isFinite(state.ema) && isFinite(state.n);
    const s = ok ? { ema: state.ema, n: state.n } : { ema: 0, n: 0 };
    const wasSlow = ok && state.slow === true;
    if (typeof dtMs === 'number' && isFinite(dtMs) && dtMs > 0 && dtMs <= 250) {
      const fps = 1000 / dtMs;
      s.ema = s.n === 0 ? fps : s.ema + (fps - s.ema) * 0.05;
      s.n += 1;
    }
    return { ema: s.ema, n: s.n, fps: s.ema, slow: s.n >= FPS_MIN && s.ema < (wasSlow ? FPS_RECOVER : FPS_SLOW) };
  }
  // 慣性と止まり方（第4弾サイクル27：M2。刻み幅によらず同じ距離・時間で、低速ではそっと止まる）
  const GLIDE_SOFT = 0.6, STOP_V = 0.05, GLIDE_H = 1 / 240;   // STOP_V は 従来の 止まっている 判定（0.05）と 同じ：最後の 切り落としの 段差を 小さくする（Codexレビュー指摘）
  function glideSpeed(sp, dt, a, b, c) {
    const co = (k) => (typeof k === 'number' && isFinite(k) && k > 0 ? k : 0);
    let v = typeof sp === 'number' && isFinite(sp) && sp > 0 ? sp : 0;
    if (!(typeof dt === 'number' && isFinite(dt) && dt > 0 && dt <= 0.1)) return v < STOP_V ? 0 : v;
    const ca = co(a), cb = co(b), cc = co(c), n = Math.ceil(dt / GLIDE_H), h = dt / n;
    for (let i = 0; i < n; i++) {
      v = Math.max(0, v - (ca * Math.min(1, v / GLIDE_SOFT) + cb * v + cc * v * v) * h);
      if (v < STOP_V) return 0;
    }
    return v;
  }
  root.nishioRollSync = { GLIDE_SOFT, STOP_V, GLIDE_H, glideSpeed, FPS_SLOW, FPS_MIN, FPS_RECOVER, shadowStretch, fpsStep, IDLE_START, IDLE_SPEED, IDLE_ACC, idleDue, idleTarget, nextIdleTarget, idleNoteFail, idleExclude, idleFailed, idleForce, R, advance, turnsFor, frameFor, TURN_PER_SEC, limitTurn, AREA_FEEL, groundFeel };
})(typeof window !== 'undefined' ? window : globalThis);
