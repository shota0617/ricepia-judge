// お米つぶの 西尾ばなし：行き先に 着いた とき、お米つぶ（あいちのかおりちゃん）が その地区の 名物・場所・行事を、自分と 関わる ことばで ひとこと 話す
// （kometalk.js の 「着いたね！」の あとに 1つ つづく）。手帳や 図鑑では なく、主人公の セリフとして 出す（docs/nishio-rashisa-brief.md の 設計原則）
// ・area：着いた 名所の 地区（areas.json の id）。'*' は どの地区でも（となりの 市町・地区の ない 所を ふくむ）
// ・months：その月だけ 先に 出す（ない ものは 一年じゅう）。月が 合う 話を 先に、同じ 地区の 話を ひとめぐり するまで 同じ話は くりかえさない
// ・pages：お米つぶの ことば。事実は docs/nishio-rashisa-brief.md の 調べた 中身だけ（そこに ない 数字・名前は 書かない）
// ・src：出どころ
(function (root) {
  const NK = 'https://nishiokanko.com/tw/specialty/', AN = 'https://aichinow.pref.aichi.jp/modelcourse/detail/122/', CITY = 'https://www.city.nishio.aichi.jp/shisei/shokai/1003109.html',
    MAFF = 'https://www.maff.go.jp/j/nousin/sekkei/museum/m_kakuti/27_kogane/index.html', MLIT = 'https://www.mlit.go.jp/river/basic_info/jigyo_keikaku/gaiyou/seibi/pdf/yahagigawa-5.pdf';
  const LIST = [
    // 西尾（抹茶・城下町・祇園祭）
    { id: 'tencha', area: 'nishio', icon: '🍵', months: [4, 5], pages: ['いまは 茶摘みの ころだよ。西尾は 抹茶の 原料の てん茶が 日本で 有数の 産地だよ。', '茶畑は 稲荷山茶園公園から 一望できる。田んぼの お米つぶとしては、緑の 畑が ちょっと うらやましいなあ。'], src: NK },
    { id: 'matcha', area: 'nishio', icon: '🍵', pages: ['西尾は 抹茶の まちだよ。てん茶は 矢作川の 川霧や 温かい 気候で 育つんだって。', '石臼で 挽いて 自分で 点てる 体験も あるよ。石臼で 挽かれるのは お米つぶには ちょっと こわいけど…'], src: NK },
    { id: 'kakigori', area: 'nishio', icon: '🍧', months: [5, 6, 7, 8, 9], pages: ['抹茶パフェや 抹茶かき氷は 4月末から 9月ごろまで 食べられるんだって。', '暑い 日は ひんやり したいな。ごはんの 上には のせられんけど。'], src: NK },
    { id: 'castle', area: 'nishio', icon: '🏯', pages: ['西尾の 城下町は、鎌倉時代の はじめに 足利義氏が 築いた 西条城が はじまりだよ。', '大給松平家 6万石の 殿さまの 町。6万石って、お米つぶが 山ほど だら。'], src: CITY },
    { id: 'kyoto', area: 'nishio', icon: '⛩', pages: ['西駅の 西がわは お寺や 神社が 多くて、「三河の 小京都」と 呼ばれとるよ。', 'ゆっくり 歩くと 気持ちが いいよ。ころころ 転がるのは ほどほどに するね。'], src: CITY },
    { id: 'gion', area: 'nishio', icon: '🎎', pages: ['城下町の にぎわいは、いまも 西尾祇園祭に のこっとるんだって。', 'お祭りの 日の 町は、見てみたいな。'], src: CITY },
    // 一色（うなぎ・港町）
    { id: 'unagi', area: 'isshiki', icon: '🐟', pages: ['一色は うなぎの 町だよ。全国の うなぎの 約2割が ここで 育つんだって。', 'うな丼は うなぎと ごはんで ひとつ。お米も 大事な 役だら？'], src: NK },
    { id: 'unagi-hist', area: 'isshiki', icon: '🐟', pages: ['一色の 養鰻は 明治27年、1894年から 続いとるよ。', 'ひつまぶしの ごはんにも なりたいな。'], src: NK },
    { id: 'ebisen', area: 'isshiki', icon: '🦐', pages: ['一色は えびせんべいも 有名だよ。さかな広場と ならぶ 町の 顔なんだって。', '焼く 体験も できるよ。せんべいは お米の 仲間でも ないけど、なんだか 親せきみたいだよ。'], src: NK },
    { id: 'chochin', area: 'isshiki', icon: '🏮', pages: ['一色には 巨大な 提灯で 知られる お祭りが あるよ。一色大提灯まつりだよ。', 'お米が 何十粒 つながっても かなわん 大きさだら。'], src: NK },
    // 吉良（黄金堤・温泉）
    { id: 'kogane', area: 'kira', icon: '🌾', pages: [{ t: '吉良の 黄金堤は、お米つぶの 聖地だよ。', mood: 'excited' }, '1686年、吉良義央が 私財を 出して、領民と 一夜で 築いたと 伝わっとるよ。長さ180m、高さ4mの 堤防だよ。', 'そのあと 水害が なくなって、金色の 稲穂が 田んぼを かざったから「黄金堤」。お米つぶは、ここの 話を 聞くと 胸が あつくなるよ。'], src: MAFF },
    { id: 'kogane-aki', area: 'kira', icon: '🌾', months: [9, 10], pages: ['この ころの 吉良の 田んぼは 稲穂の 金色だよ。黄金堤の 名前の とおりだら。', '堤が 田んぼを 守って くれたから、お米は 実れたんだよ。'], src: MAFF },
    { id: 'kaleido', area: 'kira', icon: '🔮', pages: ['吉良には 三河ガラス工芸美術館が あって、巨大な 万華鏡が 見られるよ。', 'のぞくと お米も きらきら ふえるのかな。'], src: NK },
    { id: 'kira-spa', area: 'kira', icon: '♨️', pages: ['吉良は 吉良上野介義央の 里で、吉良温泉も あるよ。', 'お米つぶは お湯に 入ると ふくらんじゃうで、見るだけに するね。'], src: NK },
    { id: 'waikiki', area: 'kira', icon: '🏖', months: [6, 7, 8, 9], pages: ['吉良には 吉良ワイキキビーチも あるんだって。夏は 海水浴の 季節だよ。', '砂浜では、お米つぶは 小さすぎて 目立たんかも しれんね。'], src: NK },
    // 幡豆（三ヶ根山・花）
    { id: 'mikane', area: 'hazu', icon: '⛰️', pages: ['幡豆は 三ヶ根山の 山並みの 町だよ。スカイラインから 景色が 見わたせるよ。', '山の 上から 見たら、田んぼも お米も 小さいね。'], src: NK },
    { id: 'carnation', area: 'hazu', icon: '🌸', pages: ['西尾は カーネーションなど 花の 産地でもあるよ。', '花も 田んぼも、土と 水と 手間で 育つんだよね。仲間だら。'], src: NK },
    // 佐久島（アート・海の幸）
    { id: 'sakushima', area: 'sakushima', icon: '⛴', pages: ['佐久島は 三河湾で いちばん 大きい 島だよ。一色港から 高速船で 約20分だよ。', '船に のって 来られて うれしいな。お米は 酔わんけど。'], src: AN },
    { id: 'art', area: 'sakushima', icon: '🎨', pages: ['佐久島には アート作品が あちこちに あるよ。22箇所とも 言われとるよ。', '黒壁の 集落も すてきだら。島の 景色が まるごと 作品だよ。'], src: AN },
    { id: 'tombolo', area: 'sakushima', icon: '🌊', pages: ['干潮の ときに 海の 道が あらわれる トンボロ現象が、西尾の 見どころの ひとつだよ。', 'ちょうどの 時間に 来られたら、歩いて わたれるよ。'], src: AN },
    { id: 'umi', area: 'sakushima', icon: '🐙', pages: ['島の 海の 幸は アサリ、タコ、磯ガキだよ。', 'タコの おにぎり、お米が 入ったら おいしそうだら。'], src: AN },
    // どこでも（矢作川・田んぼの 生きもの）
    { id: 'yahagi', area: '*', icon: '🌊', pages: ['矢作川は 西尾で 三河湾に 流れこむんだ。河口は 干拓地が 広がる 田んぼの 地帯だよ。', '黄金堤などに 守られて、田んぼが あるよ。'], src: MLIT },
    { id: 'medaka', area: '*', icon: '🐟', months: [4, 5, 6, 7, 8, 9], pages: ['田んぼの 水には メダカが すんどるよ。絶滅危惧II類の 魚だよ。', '水が あるから 会えるんだら。お米は 水が ないと 育てんのよ。'], src: MLIT },
    { id: 'ishigame', area: '*', icon: '🐢', pages: ['ニホンイシガメは、水田や 畑を えさ場や 産卵場に 使うんだって。', '田んぼは お米だけの ものじゃ ないよ。いっしょに 暮らす 仲間が いるんだよ。'], src: MLIT },
  ];
  // いまの 地区と 月で 1つ えらぶ。seen＝もう 話した id。その地区の 話を ひとめぐり したら、その分を 忘れて 最初から
  // 戻り値：{ item, seen（item を 足した もの） }。話が なければ null
  function pick(area, month, seen) {
    const mine = LIST.filter(x => x.area === area), pool = mine.length ? mine : LIST.filter(x => x.area === '*');
    if (!pool.length) return null;
    let base = seen || [], left = pool.filter(x => !base.includes(x.id));
    if (!left.length) { left = pool; base = base.filter(id => !pool.some(x => x.id === id)); }
    const item = left.find(x => x.months && x.months.includes(month)) || left.find(x => !x.months) || left[0];
    return { item, seen: [...base, item.id].slice(-60) };
  }
  root.NISHIO_KOMEBANASHI = { LIST, pick };
})(window);
