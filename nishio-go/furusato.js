// お米つぶの ふるさと：転がって 西尾市の 外（となりの 市町）に 出ると、お米の よこに 西尾の 方角を さす 小さな 矢じるしが 名物を かかえて 出て、
// お米が「岡崎市に 来たに。西尾は あっちだに。抹茶の まちだに」と ひと言。西尾市に もどる か、市町を 出て 1分たつと 消える。
// （これまでの 追加は すべて 西尾市の 中だけ。これは 西尾市を はなれた ことが きっかけで、お米が ふるさとの 方角を 知らせる）
// 手帳や 図鑑では なく、主人公の そばに 出す（docs/nishio-rashisa-brief.md の 設計原則）
// ・area：地区（nimotsu.js と 同じ id）。id：絵の 名前（pixel.js の drawNakama と そろえる）。say：方角を さした とき お米が 言う ことば（かざりの 絵文字は つけない）
// ・方角は いる 所から いちばん 近い 地区の 中心（areas.json の lat/lng）。佐久島は 島なので えらばない
// ・src：出どころ。事実は docs/nishio-rashisa-brief.md の 調べた 中身だけ（そこに ない 数字・名前は 書かない）
(function (root) {
  const NK = 'https://nishiokanko.com/tw/specialty/', MAFF = 'https://www.maff.go.jp/j/nousin/sekkei/museum/m_kakuti/27_kogane/index.html';
  const LIST = [
    { area: 'nishio', id: 'chawan', name: '抹茶わん', say: '西尾は あっちだに。抹茶の まちだに', src: NK },
    { area: 'isshiki', id: 'unagi', name: 'うなぎ', say: '一色は あっちだに。うなぎは 全国の 約2割だに', src: NK },
    { area: 'kira', id: 'inaho', name: '稲穂', say: '吉良は あっちだに。黄金堤の さとだに', src: MAFF },
    { area: 'hazu', id: 'carnation', name: 'カーネーション', say: '幡豆は あっちだに。カーネーションの 花き産地だに', src: NK },
  ];
  const WAIT = 5000;     // 西尾市の 外に 出て から 矢じるしを 出す までの ミリ秒
  const SHOW = 60000;    // 矢じるしを 出して おく ミリ秒（うるさく ならない）
  const COOL = 120000;   // 次に 出す までの ミリ秒（市境を ふらふら しても くりかえさない）
  const NIS = /西尾/;
  // 西尾市の 外か。city＝いる 市町の 名前（取れない＝空は 外に しない）
  function outside(city) { return !!city && !NIS.test(city); }
  // いる 所（lat, lng）から いちばん 近い 地区。areas＝areas.json の areas。返す：{ area, ang, km }。
  // ang＝画面の 角度（ラジアン。右＝0、下＝π/2、地図は 北が 上）。見つからなければ null
  function nearest(lat, lng, areas) {
    let best = null;
    const k = Math.cos(lat * Math.PI / 180);
    for (const a of areas || []) {
      if (!a || a.near || !LIST.some(x => x.area === a.id) || !Number.isFinite(a.lat) || !Number.isFinite(a.lng)) continue;
      const dx = (a.lng - lng) * k * 111.32, dy = (lat - a.lat) * 110.57;   // 画面の 右・下（km）
      const d = Math.hypot(dx, dy);
      if (!best || d < best.km) best = { area: a.id, ang: Math.atan2(dy, dx), km: d };
    }
    return best;
  }
  // 方角を さす 名物。西尾市の 地区だけ（月は 見ない）
  function pick(area) { return LIST.find(x => x.area === area) || null; }
  // お米の ことば。city＝いる 市町の 名前（岡崎市 など）
  function say(city, item) { return city + 'に 来たに。' + item.say; }
  root.NISHIO_FURUSATO = { LIST, WAIT, SHOW, COOL, outside, nearest, pick, say };
})(window);
