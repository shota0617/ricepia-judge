// お米つぶの ゆあみ：吉良で 止まって じっと して いると（約3秒）、お米の まわりに 湯が わいて 吉良温泉に つかる。
// 海べの 吉良なら 波が よせて 吉良ワイキキビーチで ぷかぷか（うきわ）。つかった とき お米が ひと言。動くと すっと 消える（行動：場所そのものを 楽しむ）
// （pixel.js の yuamiStep。これまでの 名物の 絵を 出す 話す・ひとりごと・ついてくる・のせる・夢・出会い・こぼす・食べる・おてだま・かさ・めぐり・つんつん・かげえ・ねどこ とは ちがい、
//  吉良の 場所（温泉・ビーチ）に お米が つかる。名物の 絵は 出さず、湯けむり・波・うきわを 描く）
// 手帳や 図鑑では なく、主人公の そばに 出す（docs/nishio-rashisa-brief.md の 設計原則）
// ・id：絵の 種類（onsen＝湯と 湯けむり／beach＝波と うきわ）。town：その 町名の 所だけ（町名の 正規表現）
// ・where：'higata'＝まわりに 海水域が ある 所だけ。say：つかった とき お米が 言う ことば（みじかく。かざりの 絵文字は つけない）
// ・src：出どころ。事実は docs/nishio-rashisa-brief.md の 調べた 中身だけ（吉良温泉・吉良ワイキキビーチ。そこに ない 数字・名前は 書かない）
(function (root) {
  const AN = 'https://aichinow.pref.aichi.jp/modelcourse/detail/122/';
  const LIST = [
    { id: 'onsen', name: '吉良温泉', town: '^吉良町', say: 'ええ ゆだね。吉良温泉だよ', src: AN },
    { id: 'beach', name: '吉良ワイキキビーチ', town: '^吉良町', where: 'higata', say: 'ワイキキビーチで ぷかぷかだよ', src: AN },
  ];
  const STILL = 3;       // じっと して から 出るまでの 秒（ねむる 12秒より 前）
  const SETTLE = 1400;   // 出はじめて から つかりおわるまで
  // いる 所：{ city, town, near（まわり 100m メッシュの 土地利用の 文字を まとめた 文字列） }
  // 西尾市の 吉良で、いる 所に 合う ものを 1つ えらぶ（ビーチは 海べだけ。海べの ときは ビーチを 先に）。なければ null
  function pick(c) {
    if (!c || !/西尾/.test(c.city || '')) return null;
    const town = c.town || '', higata = (c.near || '').includes('k');
    const mine = LIST.filter(x => new RegExp(x.town).test(town) && (x.where !== 'higata' || higata));
    return mine.length ? mine[mine.length - 1] : null;
  }
  root.NISHIO_YUAMI = { LIST, STILL, SETTLE, pick };
})(window);
