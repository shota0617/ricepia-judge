// にしおさんぽGO の「西尾の名物」：抹茶・うなぎ・えびせんべい・あさり
// 中身は次の出典に書いてある事実だけ（数字は出典の時点のもの）
//  ・西尾市観光協会「西尾の抹茶」https://nishiokanko.com/list/special/matcha
//  ・西尾市観光協会「西尾市の一色産うなぎ」https://nishiokanko.com/list/special/eel
//  ・西尾市観光協会「えびせん」のお店一覧 https://nishiokanko.com/list/shop_cat/ebisen
//  ・西尾市 学生議会（福地中学校・2018年10月29日）の市長の答え（市ウェブサイトの資料）
//  ・西尾市 市長の朝の館内放送（2019年9月2日。市ウェブサイトの資料）
// spots：その名物にゆかりのある注目スポット（spots.json の id）。そこでの説明・たからばこのまめちしき・バッジに使う
window.NISHIO_MEIBUTSU = [
  { id: 'matcha', icon: '🍵', name: '西尾の抹茶',
    spots: ['wakuwaku', 'inariyama-chaen', 'kojuin', 'jissoji', 'konoe-tei', 'kasuya-tei', 'michinoeki-okanoyama'],
    note: '全国の生産量の約20％をしめる、日本有数の抹茶の里。特許庁の地域ブランドに認定されています。',
    facts: [
      '西尾のお茶の歴史は、文永8年（1271年）創建の実相寺で、開山の聖一国師が寺の中で茶を育てさせたことに始まるといわれます。',
      '明治5年（1872年）、紅樹院の住職・足立順道が宇治から茶の種を取り寄せて茶園を開き、知多から茶師を招いて茶づくりを始めました。',
      '西尾で作るお茶の96％以上は、抹茶の原料になる「てん茶」。日光をさえぎって育てるので、甘み・うま味が増し、あざやかな緑になります。',
      '「西尾の抹茶」は、お茶の分野で抹茶に限った地域ブランドとして全国で初めて、特許庁に認定されました。',
      '温暖な気候と、矢作川がもたらす豊かな土と川霧に恵まれて、西尾は全国の抹茶の生産量の約20％をしめます。',
      '2019年の全国茶品評会のてん茶部門で、西尾市の生産者が農林水産大臣賞（質の面での日本一）を受けました。',
    ] },
  { id: 'unagi', icon: '🐟', name: '一色産うなぎ',
    spots: ['isshiki-sakana', 'michinoeki-okanoyama'],
    note: '国産うなぎの5尾に1尾は一色産。「西尾の抹茶」とともに特許庁の地域ブランドです。',
    facts: [
      '一色町にうなぎが入ってきたのは明治27年（1894年）。コイやボラの池に、うなぎをいっしょに育てたのが始まりです。',
      '一色の養鰻が大きく伸びたのは、昭和34年の伊勢湾台風がきっかけ。被害のあとに農地が養殖池に変わり、養鰻専用の水道も引かれました。',
      '一色町の養鰻池はすべて、養鰻専用水道で取った矢作川水系の水を使っています。',
      '一色は全国でも有数のうなぎの産地で、国産うなぎの5尾に1尾は一色産といわれます。',
      '出荷のときは、生産者どうしが力を合わせて、池からうなぎを揚げます（池揚げ）。',
      'うなぎのマスコット「まんてんくん」は、若手の生産者の「一色うなぎ研究会」が作りました。「まん」は鰻、「てん」は天にも昇る うなぎのぼりの意味です。',
    ] },
  { id: 'ebisen', icon: '🦐', name: '三河一色えびせんべい',
    spots: ['isshiki-sakana', 'michinoeki-okanoyama'],
    note: '一色が発祥の地といわれる、えびのせんべい。平成30年に地域ブランドになりました。',
    facts: [
      'えびせんべいは一色が発祥の地といわれ、平成30年（2018年）2月に「三河一色えびせんべい」として地域ブランドに認定されました。',
      '西尾市は首都圏でPRするとき、抹茶・うなぎ・えびせんべいの「3点セット」で紹介しています。',
      '一色町には、えびせんべいの店や工場が何軒もあり、一色さかな広場や道の駅にしお岡ノ山でも買えます。',
    ] },
  { id: 'asari', icon: '🐚', name: '三河湾のあさり',
    spots: ['koromozaki', 'tombolo'],
    note: '三河湾は、長いあいだ漁獲量が全国一だった、あさりの名産地です。',
    facts: [
      '愛知県のあさりの漁獲量は長く全国一でしたが、2014年ごろから大きくへっていて、いまは資源をもどす取り組みが続いています（愛知県 水産試験場）。',
    ] },
  // ==== となりの市町（岡崎・安城・碧南・高浜・幸田・蒲郡。area にその市町の id。2026年10月に調査、出典は src） ====
  {"id": "hatcho-miso", "area": "okazaki", "icon": "🫘", "name": "八丁味噌", "spots": ["okazaki-kakukyu", "okazaki-maruya"], "note": "岡崎城から西へ八丁の八丁村（いまの八帖町）で生まれた、大豆と塩だけでつくる豆みそです。", "facts": ["岡崎城から西へ八丁（約870m）の八丁村（いまの岡崎市八帖町）でつくられたことが、名前の由来とされています。", "いまこの地区で八丁味噌をつくっているのは、カクキューとまるやの2軒です。", "原料は大豆と塩だけで、木桶に仕込んで「二夏二冬」（2年以上）かけて熟成させます。", "カクキューでは、直径約1.8mの木桶に約6トンの味噌を仕込み、その上に約3トンの石を積みます。", "重石の石のほとんどは、むかし矢作川の上流から運んできた天然の川石で、何百年も大切に使い続けています。"], "src": ["https://aichinow.pref.aichi.jp/features/detail/267/", "https://tabi-mag.jp/ai0110/", "https://www.jeepe.jp/ja/articles/hatcho-miso-no-sato-2321", "https://rurubu.jp/andmore/spot/80023872"]},
  {"id": "nukata-tabelin", "area": "okazaki", "icon": "🍚", "name": "額田のお米「たべりん」（ミネアサヒ）", "spots": ["okazaki-kuragari"], "note": "岡崎の山あい・額田地域でとれる、ミネアサヒ100%のお米です。", "facts": ["「たべりん」は、岡崎市額田地域の緑ゆたかな山あいでとれる、ミネアサヒ100%のお米です。", "ミネアサヒは、1981年に愛知県が開発して品種登録したお米で、山あいの田んぼに向いています。", "岡崎市の北部・東部と額田地域は海抜およそ50mから790mの間にあり、昼と夜の温度差が大きいので、おいしいお米がそだちます。", "額田の千万町棚田では、岡崎市ぬかたブランド協議会が田んぼを守る計画をつくり、草とりを楽にするためにヤギを放すことなども考えています。"], "src": ["https://www.pref.aichi.jp/soshiki/nogyo-shinko/okazaki-nourinsuisanbutsu.html", "https://www.pref.aichi.jp/uploaded/attachment/554298.pdf", "https://www.chisou.go.jp/tiiki/tanada/shitei/aichi/240208okazaki_nukata_brand_plan.pdf"]},
  {"id": "okazaki-sekkouhin", "area": "okazaki", "icon": "🪨", "name": "岡崎石工品（石灯籠）", "spots": [], "note": "岡崎の花崗岩でつくる石灯籠などで、国の伝統的工芸品です。", "facts": ["1590年に岡崎城主の田中吉政が、城下町づくりのために河内・和泉の石工をまねいたのが始まりといわれています。", "近くの山で良い花崗岩がとれ、重い石灯籠を矢作川の舟で江戸や大阪へ運べたことで、さかんになりました。", "1979年8月3日に、国の伝統的工芸品に指定されました。"], "src": ["https://www.pref.aichi.jp/sangyoshinko/jibasangyo/industry/okazaki-sekkouhin.html"]},
  {"id": "anjo-nihon-denmark", "area": "anjo", "icon": "🌾", "name": "日本デンマークの農業", "spots": ["anjo-denpark"], "note": "明治用水の水で農業が進み、安城のあたりは「日本デンマーク」と呼ばれた。", "facts": ["碧海台地はむかし水が足りず、村どうしの水争いも多かった。", "明治用水は明治13年（1880年）に完成し、いまも安城市を中心に4,000haをこえる農地に水を送っている。", "大正の終わりから昭和のはじめにかけて、安城を中心とする碧海郡は進んだ農業の地域として「日本デンマーク」と呼ばれた。", "農政家の山崎延吉は愛知県立農林学校（いまの安城農林高校）の初代校長で、安城の農業がよくなるよう力をつくした。", "いまの安城市でも、米・小麦・大豆・いちじく・梨などづくりがさかん。"], "src": ["https://www.city.anjo.aichi.jp/zigyo/nogyo/anjonogyo/documents/2anjonougyounoayumi.pdf", "https://www.library.city.anjo.aichi.jp/book/shiryo/kyodo2/documents/13denmark.pdf", "https://www.city.anjo.aichi.jp/shisei/sisei-yoran/documents/70digest1216.pdf", "https://www.city.anjo.aichi.jp/shisei/pressrelease/documents/26081801.pdf"]},
  {"id": "anjo-nashi", "area": "anjo", "icon": "🍐", "name": "安城の梨", "spots": [], "note": "明治時代から続く「安城梨」。安城生まれの品種「甘水」もある。", "facts": ["安城市では明治時代から梨づくりが始まり、「安城梨」として親しまれてきた。", "昭和50年代に、長十郎や二十世紀から、幸水・豊水・新高などに切りかわった。", "平成2年に、安城市の梨農家が育てた「甘水（かんすい）」が品種登録された。幸水より早くとれて、大きくてあまい。", "とれる時期は、甘水が7月20日ごろ〜8月はじめ、幸水が8月はじめ〜お盆明け、豊水が8月下旬〜9月上旬、新高が9月中旬〜10月中旬。"], "src": ["https://www.pref.aichi.jp/uploaded/attachment/554272.pdf"]},
  {"id": "hekinan-ninjin", "area": "hekinan", "icon": "🥕", "name": "碧南のにんじん（へきなん美人）", "spots": ["hekinan-aoi-park"], "note": "碧南は冬にんじんの産地で、甘いブランドにんじん「へきなん美人」が育てられている。", "facts": ["碧南市は冬にんじんの全国有数の産地（2021年産の生産量は全国3位）。", "「へきなん美人」は、あいちの伝統野菜「碧南鮮紅五寸」をもとにした、甘みの強いオリジナル品種。", "矢作川から運ばれたサラサラの砂地の畑で育てられている。", "昭和42年に、冬にんじんの指定産地になった。", "収穫のいちばんいそがしい時期は1月から2月ごろ。", "1月23日は「碧南人参の日」。生産者と市内のお店が いっしょに PR している。"], "src": ["https://www.city.hekinan.lg.jp/city_info/photo_news/backnumber/2025/22519.html", "https://www.city.hekinan.lg.jp/soshiki/keizai_kankyo/nogyo_suisan/1/17517.html", "https://www.city.hekinan.lg.jp/soshiki/keizai_kankyo/nogyo_suisan/1/4963.html", "https://www.city.hekinan.lg.jp/city_info/photo_news/backnumber/2021/16713.html"]},
  {"id": "hekinan-mirin", "area": "hekinan", "icon": "🍶", "name": "本みりん（九重味淋）", "spots": ["hekinan-kokonoe-mirin"], "note": "大浜の九重味淋は、1772年から本みりんを造り続けている老舗。", "facts": ["九重味淋は1772年（安永元年）に、いまの碧南市で創業した。", "看板の本みりん「九重櫻」は、国産のもち米・米こうじ・しょうちゅうから、昔ながらの作り方で造られている。", "工場と資料館は、予約すれば無料で見学できる。", "直売所「石川八郎治商店」の名前は、明治時代にパリ万博へみりんを出品した当主・石川八郎治にちなむ。", "九重味淋の本社は、西方寺の北どなりにある。"], "src": ["https://www.pref.aichi.jp/press-release/150th-kokonoemirin.html", "https://aichinow.pref.aichi.jp/spots/detail/2731/", "https://co-trip.jp/article/486741/", "https://www.pref.aichi.jp/soshiki/koen/keikanshigen-hekinan.html"]},
  {"id": "sanshu-kawara", "area": "takahama", "icon": "👹", "name": "三州瓦と鬼瓦", "spots": ["takahama-kawara-museum", "takahama-minato-station"], "note": "高浜は、粘土瓦の国内最大の産地「三州瓦」の中心的な産地で、鬼瓦づくりの職人「鬼師」のまち。", "facts": ["三州瓦は、全国の粘土瓦の生産量の約7割をしめる最大の産地（愛知県の資料）。", "高浜市は三州瓦の中心的な産地のひとつ。", "鬼瓦をつくる職人を「鬼師」とよぶ。鬼師の技は、全国の文化財の建物をなおすのにも欠かせない。", "高浜港駅前のニコニコ鬼広場には、東大寺転害門の鬼瓦をモデルにした縦4.5m・横4.2mの鬼瓦がある。", "散策路「鬼みち」は高浜港駅から三河高浜駅までの約5kmで、歩くだけなら約1時間10分。"], "src": ["https://www.pref.aichi.jp/sangyoshinko/jibasangyo/industry/_sansyugawara.html", "https://www.museum.or.jp/museum/4733", "https://aichinow.pref.aichi.jp/events/detail/3505/", "https://tabi-mag.jp/ai0387/"]},
  {"id": "yoshihama-saiku-ningyo", "area": "takahama", "icon": "🎎", "name": "吉浜細工人形", "spots": ["takahama-ningyo-koji"], "note": "吉浜に伝わる、愛知県の無形文化財の細工人形。", "facts": ["吉浜細工人形は愛知県の無形文化財。", "人形小路は約800mの散歩道で、等身大の人形の舞台が9つある。", "人形小路のとちゅうにある宝満寺と柳池院では、毎年5月に細工人形をかざって奉納するならわしがある。", "名古屋城の菊人形展で菊のかざりつけをする「菊師」も、吉浜細工人形保存会のメンバー。"], "src": ["https://allabout.co.jp/gm/gc/66396/", "https://aichinow.pref.aichi.jp/events/detail/2183/"]},
  {"id": "fudegaki", "area": "kota", "icon": "🟠", "name": "筆柿", "spots": ["kota-michinoeki"], "note": "形が筆の先ににている、幸田町いちばんの特産の柿。", "facts": ["形が毛筆ににていることから「筆柿」と名づけられたといわれる。", "幸田町の筆柿は、全国シェアの約95%をしめる。", "1本の木に甘柿と渋柿が実る「不完全甘柿」で、出荷の前に甘柿と渋柿を分けている。", "富有柿や次郎柿より、約1か月早く出荷できる。", "例年9月中旬から出荷が始まる。", "江戸時代から、町の南西部の農家の庭先で育てられてきた。"], "src": ["https://www.town.kota.lg.jp/soshiki/13/764.html", "https://www.ja-aichimikawa.or.jp/product/product_kaki.php", "https://www.ja-aichimikawa.or.jp/wp/archives/7157"]},
  // ==== となりの市町ここまで ====
];
