// にしおさんぽGO：画面の文字のかわりに使う小さなドット絵（12×12）
// ・<i class="pi" data-pi="coin"></i> と書くと、その絵になる（NSG_ICONS.html('coin') でも作れる）
// ・canvas に描くときは NSG_ICONS.canvas('flag')
// ・絵は1文字＝1ドット。. は透明、ほかの文字は下の色
(() => {
  'use strict';
  const PAL = {
    k: '#1a1a1a', w: '#ffffff', W: '#d8d8d8', a: '#a8a8a8', A: '#686868',
    y: '#ffd54f', Y: '#c89a1a', o: '#f2a516', r: '#d23a2e', R: '#8f2018', p: '#f4a7c0', P: '#d9668f',
    g: '#7cc04a', G: '#2f7a34', b: '#5aa9e6', B: '#1b4fa0', n: '#a0683a', N: '#5d3a1a', c: '#fff3b0', s: '#bfe6ff',
  };
  const ART = {
    coin: [
      '....kkkk....', '..kkyyyykk..', '.kyyyyyyyyk.', '.kyywyyyyYk.', 'kyywyyyyyyYk', 'kyywyyyyyyYk',
      'kyyyyyyyyyYk', 'kyyyyyyyyyYk', '.kyyyyyyyYk.', '.kYyyyyyYYk.', '..kkYYYYkk..', '....kkkk....'],
    star: [
      '.....kk.....', '....kyyk....', '....kyyk....', 'kkkkyyyykkkk', 'kyyyywyyyyyk', '.kyyywyyyyk.',
      '..kyyyyyyk..', '..kyyyyyyk..', '.kyyykkyyyk.', '.kyyk..kyyk.', 'kyyk....kyyk', 'kkk......kkk'],
    bowl: [
      '...kkkkkk...', '.kkwwwwwwkk.', 'kwwwwwwwwwwk', 'kwwwwwwwwwwk', 'kkkkkkkkkkkk', 'krrrrrrrrrrk',
      '.krrrwwrrrk.', '.krrrrrrrrk.', '..kRRRRRRk..', '...kkkkkk...', '....kRRk....', '...kkkkkk...'],
    castle: [
      '..r......r..', '..k......k..', '.kkk.kk.kkk.', '.kak.kk.kak.', '.kaakkkkaak.', '.kaaaaaaaak.',
      '.kakaaaakak.', '.kaaaaaaaak.', '.kaaakkaaak.', '.kaaknnkaak.', '.kaaknnkaak.', '.kkkkkkkkkk.'],
    map: [
      '............', 'kkkkkkkkkkkk', 'kggbgggkyggk', 'kgbbggkyyggk', 'kgbggkyygggk', 'kbbgkyyggrgk',
      'kbggyygggrgk', 'kbgyyggggggk', 'kbyyggggbbgk', 'kyyggggbbbgk', 'kkkkkkkkkkkk', '............'],
    note: [
      '.kkkkkkkkk..', '.kcccccccck.', 'kkcakkkkack.', '.kcccccccck.', 'kkcakkkkack.', '.kcccccccck.',
      'kkcakkkkack.', '.kcccccccck.', 'kkcakkkkack.', '.kcccccccck.', '.kkkkkkkkkk.', '............'],
    gift: [
      '..kk....kk..', '.krrk..krrk.', '..krrkkrrk..', 'kkkkkkkkkkkk', 'kyyyyrryyyyk', 'kyyyyrryyyyk',
      'kkkkkkkkkkkk', '.kYYYrrYYYk.', '.kYYYrrYYYk.', '.kYYYrrYYYk.', '.kYYYrrYYYk.', '.kkkkkkkkkk.'],
    gear: [
      '....kkkk....', '.kk.kaak.kk.', '.kakkaakkak.', '..kaaaaaak..', 'kkaaakkaaakk', 'kaaakwWkaaak',
      'kaaakWAkaaak', 'kkaaakkaaakk', '..kaaaaaak..', '.kakkaakkak.', '.kk.kaak.kk.', '....kkkk....'],
    scroll: [
      '.kkkkkkkkkk.', 'knnkcccccckk', 'kNnkcccccck.', '.kkkcakkkck.', '...kcccccck.', '...kcakkkck.',
      '...kcccccck.', '...kcakkkck.', '...kcccccck.', '.kkkkkkkkkkk', 'kNnnnnnnnnNk', '.kkkkkkkkkk.'],
    book: [
      '............', '.kkkk..kkkk.', 'kccccckcccck', 'kcakkakcakck', 'kccccckcccck', 'kcakkakcakck',
      'kccccckcccck', 'kcakkakcakck', 'kccccckcccck', 'kBBBBBkBBBBk', '.kkkkkkkkkk.', '............'],
    flag: [
      'kk..........', 'krrrkk......', 'krrrrrkk....', 'krrwrrrrk...', 'krrrrrkk....', 'krrrkk......',
      'kkk.........', 'kn..........', 'kn..........', 'kn..........', 'kn..........', 'kkk.........'],
    chest: [
      '............', '..kkkkkkkk..', '.knnnnnnnnk.', 'knnnnnnnnnnk', 'kkkkkyykkkkk', 'kNNNkyykNNNk',
      'kkkkkkkkkkkk', 'knnnnyynnnnk', 'knnnnnnnnnnk', 'kNNNNNNNNNNk', 'kkkkkkkkkkkk', '............'],
    card: [
      'kkkkkkkkkkkk', 'kyyyyyyyyyyk', 'kykkkkkkkkyk', 'kyksssssskyk', 'kykssswsskyk', 'kyksgsssskyk',
      'kykggsgsskyk', 'kykgggggskyk', 'kykkkkkkkkyk', 'kyyyyyyyyyyk', 'kkkkkkkkkkkk', '............'],
    fire: [
      '.....k......', '....kok.....', '....koko....', '...kooook...', '..koooyok...', '.koooyyook..',
      '.kooyyyyok..', 'koooyyyyook.', 'kooyywyyyok.', 'kooyywwyyok.', '.kooyyyyok..', '..kkkkkkk...'],
    clock: [
      '...kkkkkk...', '..kwwwwwwk..', '.kwwwkwwwwk.', 'kwwwwkwwwwwk', 'kwwwwkwwwwwk', 'kwwwwkkkkwwk',
      'kwwwwwwwwwwk', 'kwwwwwwwwwwk', '.kwwwwwwwwk.', '..kwwwwwwk..', '...kkkkkk...', '............'],
    home: [
      '.....kk.....', '....krrk....', '...krrrrk...', '..krrrrrrk..', '.krrrrrrrrk.', 'kkkkkkkkkkkk',
      '.kccccccck..', '.kcbbkcnnk..', '.kcbbkcnnk..', '.kcccccnnk..', '.kkkkkkkkk..', '............'],
    new: [
      '.....k......', '.....y......', '....yyy.....', 'kyyyywyyyyk.', '.kyyywyyyk..', '..kyyyyyk...',
      '..kyyyyyk...', '.kyyk.kyyk..', '.kyk...kyk..', '.kk.....kk..', '..........y.', '.........yyy'],
    up: [
      '.....kk.....', '....kyyk....', '...kyyyyk...', '..kyyyyyyk..', '.kyyyyyyyyk.', 'kkkkyyyykkkk',
      '...kyyyyk...', '...kyyyyk...', '...kyyyyk...', '...kyyyyk...', '...kYYYYk...', '...kkkkkk...'],
    upright: [
      '....kkkkkkkk', '....kyyyyyyk', '.....kyyyyyk', '......kyyyyk', '.....kyyyyyk', '....kyyyykyk',
      '...kyyyyk.kk', '..kyyyyk....', '.kyyyyk.....', 'kYyyyk......', 'kYYYk.......', 'kkkk........'],
    pin: [
      '...kkkkkk...', '..krrrrrrk..', '.krrrwwrrrk.', '.krrwwwwrrk.', '.krrrwwrrrk.', '.krrrrrrrrk.',
      '..krrrrrrk..', '...krrrrk...', '....krrk....', '....krrk....', '.....kk.....', '............'],
    sun: [
      '.....kk.....', '.k...yy...k.', '..k.kkkk.k..', '...kyyyyk...', '..kyyyyyyk..', 'kykyyyyyykyk',
      'kykyyyyyykyk', '..kyyyyyyk..', '...kyyyyk...', '..k.kkkk.k..', '.k...yy...k.', '.....kk.....'],
    cloud: [
      '............', '............', '....kkkk....', '...kwwwwk...', '.kkwwwwwwkk.', 'kwwwwwwwwwwk',
      'kwwwwwwwwwWk', 'kwwwwwwwwWWk', '.kWWWWWWWWk.', '..kkkkkkkk..', '............', '............'],
    rain: [
      '....kkkk....', '...kWWWWk...', '.kkWWWWWWkk.', 'kWWWWWWWWWAk', 'kAAAAAAAAAAk', '.kkkkkkkkkk.',
      '..b...b...b.', '.b...b...b..', '............', '...b...b...b', '..b...b...b.', '............'],
    snow: [
      '.....b......', '..b..b..b...', '...b.b.b....', '....bbb.....', 'bbbbbwbbbbb.', '....bbb.....',
      '...b.b.b....', '..b..b..b...', '.....b......', '............', '............', '............'],
    sakura: [
      '.....kk.....', '....kppk....', '.kk.kppk.kk.', 'kppkkppkkppk', 'kpppkyykpppk', '.kppyyyyppk.',
      '.kppyyyyppk.', 'kpppkyykpppk', 'kppk.kk.kppk', '.kk.kppk.kk.', '....kPPk....', '.....kk.....'],
    sunflower: [
      '...k.kk.k...', '..kykyykyk..', '.kyyyyyyyyk.', 'kyyyNNNNyyyk', '.kyNnNNnNyk.', 'kyyNNnnNNyyk',
      '.kyNnNNnNyk.', 'kyyyNNNNyyyk', '.kyyyyyyyyk.', '..kykggkyk..', '...k.kg.k...', '.....kG.....'],
    momiji: [
      '.....kk.....', '....krrk....', '.k..krrk..k.', 'krk.krrk.krk', 'krrkkrrkkrrk', '.krrrrrrrrk.',
      'kkrrrrrrrrkk', '.krrrrrrrrk.', '..kkrrrrkk..', '....kRRk....', '.....kR.....', '.....kk.....'],
    snowman: [
      '....kkkk....', '...kwwwwk...', '...kwkwkw...', '...kwwowk...', '....kkkk....', '..kkwwwwkk..',
      '.kwwwwwwwwk.', 'kwwwwkwwwwwk', 'kwwwwwwwwwwk', 'kwwwwkwwwwwk', '.kWWWWWWWWk.', '..kkkkkkkk..'],
  };
  const cache = {};
  function canvas(name) {
    if (cache[name]) return cache[name];
    const rows = ART[name];
    if (!rows) return null;
    const c = document.createElement('canvas');
    c.width = 12; c.height = 12;
    const x = c.getContext('2d');
    rows.forEach((row, y) => { for (let i = 0; i < 12; i++) { const ch = row[i]; if (ch && ch !== '.' && PAL[ch]) { x.fillStyle = PAL[ch]; x.fillRect(i, y, 1, 1); } } });
    cache[name] = c;
    return c;
  }
  const urls = {};
  const url = name => urls[name] || (urls[name] = canvas(name) ? canvas(name).toDataURL() : '');
  // 文字のかわりに置く <img>（alt は読み上げ用の言葉）
  const html = (name, alt = '', cls = '') => (ART[name] ? `<img class="pi${cls ? ' ' + cls : ''}" src="${url(name)}" alt="${alt}" width="12" height="12"/>` : '');
  // ページに書いてある <i data-pi="…"> を絵にする
  function fill(root = document) {
    root.querySelectorAll('i[data-pi]').forEach(el => { el.outerHTML = html(el.dataset.pi, el.getAttribute('aria-label') || '', el.className.replace(/\bpi\b/, '').trim()); });
  }
  // 方角（北・北東…）の矢印：上と右上の絵を90度ずつ回す
  const DIRS = { 北: ['up', 0], 北東: ['upright', 0], 東: ['up', 90], 南東: ['upright', 90], 南: ['up', 180], 南西: ['upright', 180], 西: ['up', 270], 北西: ['upright', 270] };
  const arrow = dir => { const d = DIRS[dir]; return d ? `<img class="pi" src="${url(d[0])}" alt="${dir}" width="12" height="12" style="transform:rotate(${d[1]}deg)"/>` : ''; };
  window.NSG_ICONS = { ART, canvas, url, html, fill, arrow, names: Object.keys(ART) };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => fill()); else fill();
})();
