# にしおさんぽGO を広告・マーケティングに使う

> いま出している広告（Google・Meta・LINEヤフー広告）と LINE リッチメニューに出す手順と材料は `docs/ads-game-kit.md`。

にしおさんぽGO は、遊ぶことがそのまま当店（近藤米穀店・らいすぴあ）への来店や ricepia.jp への訪問につながるように作ってあります。
ここでは、広告やお店の企画にゲームを使うための しくみ をまとめます。

## 1. 広告のリンク（どの広告から来たかを数える）

ゲームのURL `https://go.ricepia.jp/` に、次のパラメータを付けて広告やQRコードに使います。

| パラメータ | 例 | 何がおきるか |
|---|---|---|
| `utm_source`・`utm_medium`・`utm_campaign`・`utm_content` | `utm_source=meta&utm_medium=paid&utm_campaign=shinmai` | Google アナリティクス（GA4）でどの広告から来たかが分かる。ゲームの `landing` イベントにも入る |
| `play=1` | `?play=1` | はじめての人も「操作して遊ぶ」ですぐ始まる（はじめの画面をとばす）。家で見る広告向け |
| `spot=スポットのid` | `?spot=kondo-beikoku` | そのスポット（spots.json の id）を見せる。「操作して遊ぶ」ならそこへ移動、「あるいて遊ぶ」なら地図をそこへ |
| `c=キャンペーンのid` | `?c=shinmai-sample` | そのキャンペーンから来た人として数え（`campaign_landing`）、キャンペーンをお知らせする |
| `from=どこから` | `?from=pop-honten` | チラシ・店頭POP・車のステッカーなど、紙やモノから来た人を数える |

例：
- Meta 広告（家で遊んでもらう）：`https://go.ricepia.jp/?utm_source=meta&utm_medium=paid&utm_campaign=game&play=1`
- 本店のレジ横のQR：`https://go.ricepia.jp/?from=pop-honten&spot=kondo-beikoku&utm_source=qr&utm_medium=offline&utm_campaign=honten`

## 2. 数えられること（計測）

計測タグは `nishio-go/analytics.js`（ricepia.jp と同じ GA4・Google 広告・LINEヤフー広告。Meta ピクセルはデータセットIDが決まったら入れる）。
公開しているドメインでだけ動き、「せってい」でオフにできます。現在地の座標は送りません。

| イベント | いつ |
|---|---|
| `landing` | 広告・QR・シェアのリンクから来た（utm_*・c・spot・from・play） |
| `game_start` | 遊びかたをえらんで始めた（端末ごとに1回。累計プレイ人数はこの数） |
| `play_day` | その日はじめて遊んだ（端末ごとに1日1回） |
| `checkin`・`shop_checkin` | 名所・当店にチェックインした（当店は Meta では「Lead」） |
| `idle_return`・`idle_fact`・`idle_upgrade`・`guide_pick` | るすばんから戻った・おまかせ歩きで まちメモ・おまかせ強化・行き先を自分で変えた |
| `guide_set`・`guide_arrive`・`npc_talk` | みちしるべ・人との会話 |
| `share_open`・`share` | シェアの画面を開いた・シェアした（kind：log／rice、via：x／line／facebook／copy／image／native） |
| `campaign_landing`・`campaign_bonus`・`campaign_link` | キャンペーンのリンクから来た・当店チェックインのボーナス・くわしいページへ |
| `sponsor_link` | 協賛スポットのサイトへ進んだ |

当店のサイト・道案内・キャンペーン・協賛のリンクには、`utm_source=nishio-go&utm_medium=game` が自動で付きます。

## 3. シェア（口コミ）

「きろく」の 📣 シェア から、X・LINE・Facebook・コピー・端末のシェアができます。
シェア用の画像（1200×630）は、その人のレベル・めぐった名所・話した人と、こよみ（季節）、当店の名前・go.ricepia.jp をのせて、その場で描きます（どこにも送りません）。
シェアのリンクには `utm_source=share` が付くので、シェアから来た人を数えられます。

## 4. キャンペーン（お店の企画と連動）

`nishio-go/campaigns.json` に書きます。

```json
{ "id": "shinmai2026", "active": true, "from": "2026-10-01", "to": "2026-11-30", "icon": "🌾",
  "title": "新米キャンペーン", "text": "期間中、当店で…", "bonus": { "shopCheckin": 50 }, "url": "https://ricepia.jp/..." }
```

- `active: true` のものだけ本番で出ます（`false` はサンプルとして「操作して遊ぶ」でだけ出ます。いまは新米キャンペーンのサンプルが入っています）
- 期間中は「きろく」のいちばん上に出て、`bonus.shopCheckin` があれば当店でのチェックインに1日1回そのポイントが足されます
- 店頭の特典（値引きなど）は、ゲームのポイント交換（`nishio-go/rewards.json`）と組み合わせられます。特典の中身と期間は、お店で決めてから `active` にしてください

## 5. 協賛スポット（地元のお店といっしょに）

`nishio-go/spots.json` の注目スポットに `sponsor` を書くと、説明に「🤝 協賛」の札と、そのお店のサイトへのボタンが出ます（`sponsor_link` で数えます）。

```json
"sponsor": { "name": "〇〇菓子店", "text": "抹茶だんごが名物", "url": "https://example.jp/" }
```

## 6. 広告用の動画と画像（ほんとうのゲーム画面から）

`tools/make-promo.js`（Actions の「Make Nishio promo」）が、ヘッドレスのブラウザで「操作して遊ぶ」を台本どおりに進め、字幕をのせて作ります。

- 縦長の動画（9:16・1080×1920・約30秒・mp4）：はじめの画面 → まちを歩く → 人の話で行き先が決まる → 季節と天気 → おまかせ歩きで まちメモ → ほかの行き先も選べる → せかいちず → エンドカード（go.ricepia.jp・当店の名前）。Reels・ショート・ストーリーズ、店頭のモニターに
- 場面ごとの静止画（9:16）と、リンク広告用の横長画像（1200×630）

動画は Actions の実行ページの「Artifacts」（nishio-go-promo）から取り出します。画像は `mkt/nishio-go/` にもコミットされます。
字幕は `docs/fun-core.md` と ricepia.jp に書いてあることだけです。字幕を変えるときは `tools/make-promo.js` の `caption(...)` を書きかえて、Actions を手動で実行します。
