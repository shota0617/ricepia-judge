// 翔米キャラクターの置き場所（第4弾サイクル65）：店の描画矩形に対し、店の右手前・足元が地面の線に合う位置を返す。
// 純関数だけ（DOM・保存・ポイントには触らない）。不正な入力でも例外は出さない。
(function (root) {
  const W = 84, H = 116;
  function place(sx, sy, size) {
    try {
      if (![sx, sy, size].every(v => typeof v === 'number' && isFinite(v)) || size <= 0) return null;
      const ground = sy + size * 0.72, h = size * 0.44;
      return { x: sx + size * 0.84, y: ground - h, w: h * W / H, h };
    } catch (e) { return null; }
  }
  root.nishioShomai = { W, H, place };
})(typeof window !== 'undefined' ? window : globalThis);
