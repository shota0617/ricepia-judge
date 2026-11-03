// 絵あてクイズ（どこでしょう）：名所の ドット絵を 大きく 見て、3つの 名前から 1つ えらぶ。問題は 日づけで 決まる（その日は 同じ 1問）。
// 純関数だけ（DOM・保存・ポイントには 触らない）。list は [{id, name, area}]。
(function (root) {
  // 文字列から 決まった 数を 作る（FNV-1a）
  function seedOf(str) {
    let h = 2166136261;
    const s = String(str);
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return h >>> 0;
  }
  // シードつきの 乱数（mulberry32）
  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function shuffle(arr, rand) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); const t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }
  // 今日の 問題：{id, choices:[id,...]}。正解は 1つ、はずれは 同じ area を 先に、足りなければ 全体から
  function pick(list, dateStr) {
    const seen = new Set();
    const L = (Array.isArray(list) ? list : []).filter(x => x && x.id != null && !seen.has(x.id) && seen.add(x.id));
    if (L.length < 3) return null;   // 3つ えらべない ときは 出さない（1つだけなら かならず 当たってしまう）
    const rand = rng(seedOf(String(dateStr)));
    const ans = L[Math.floor(rand() * L.length)];
    const others = L.filter(x => x.id !== ans.id);
    const same = shuffle(others.filter(x => x.area && x.area === ans.area), rand);
    const rest = shuffle(others.filter(x => !(x.area && x.area === ans.area)), rand);
    const wrong = [];
    for (const x of same.concat(rest)) { if (wrong.length >= 2) break; if (!wrong.includes(x.id)) wrong.push(x.id); }
    return { id: ans.id, choices: shuffle([ans.id].concat(wrong), rand) };
  }
  const judge = (quiz, id) => !!quiz && quiz.id === id;
  root.nishioPhotoQuiz = { seedOf, pick, judge };
})(typeof window !== 'undefined' ? window : globalThis);
