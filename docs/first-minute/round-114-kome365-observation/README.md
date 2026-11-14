# 米づくり365：320×568での最初の1分

**新規確定候補0件、製品・テスト変更0の観察報告。** 15送信すべてにカードのdrag・変形・翌日への進行を記録し、送信済みの無反応0。○7／✗8で1月1日から1月16日へ進んだ。未送信8機会を無反応へ加算せず、初心者の理解・離脱率や改善効果は測っていない。

対象は `15a9308c0ffeb7e2ad28de91fcc8136888450862` の `/kome365/index.html`。最上位で `python3 -m http.server 8000` を動かし、ローカルChromium、新しいcontext、320×568、CPU1、isMobile/hasTouch、CDP `Input.dispatchTouchEvent` で1回遊んだ。外部部品は不要で、同梱three r128を使用。10秒無操作→観察写真保存→60秒の入力時計。写真保存には5200.2ms、その後の確認に86.7msかかり、play開始は観察開始から15.2883秒。これは入力後の製品応答時間とは別。

| プレイ時計 | 記録されたこと |
|---|---|
| 0.252秒 | 初入力を送信 |
| 0.7286秒／0.8421秒 | 初drag／初inline変形のDOM記録（初送信から476.6／590.1ms） |
| 1.1748秒 | 1月2日と最初の理由欄on・○文字をDOM記録（初送信から922.8ms） |
| 57.553秒 → 57.674秒 | 最終入力 → 指を離す送信 |
| 60秒まで | 15日進行、進行後の理由表示クラスon・理由文字15回。前の入力から理由文字が変わったのは14回 |

4手目は日付が進み、前の入力と同文の肯定理由の文字とonクラスを記録した。文字の変化14と理由表示クラスon・理由文字15を区別し、無反応にしない。理由要素のopacity・矩形・hitは保存しておらず、15回すべてが画面で読めたという意味ではない。時刻はDOM初観測で、物理paint・正確な報酬発生時刻ではない。イベント発生からcapture観測は272.6–472.6ms、captureからdragは3.6–14.9ms。配送・計測・製品処理の原因を分離できず、特定の描画計算を原因とはしない。

23機会の内訳は15送信＋8未送信。現在の手本を使った6回と、同じカードで以前観測した手本を使った9回を区別する。送信は全て左100pxで選択した手本の方向と一致し、左右の成績比較ではない。未送信8回もカードと手本は可視記録・指opacity1だが、台本の横8px以上という方向採用基準を満たさなかった（うち3回は残像opacityも不足）。8回の手本消失や入力消失とはしない。120CDP命令全ACK、trusted pointer45件（down/move/up各15）。要求120msに対して実送信120.284–134.135msで、ACK待ち時間とは別。

原写真はこの1回からの無加工PNGで、変更前後比較ではない。

| 原写真 | 要求 → 保存完了（各時計の秒） | 原画の表示 |
|---|---|---|
| [観察10秒](observe-10s.png) | 観察10.0013 → 15.2016 | 1月1日「元日の田んぼ」、二択と「田おこし まえ」。この写真に指は確認できない |
| [play10秒](play-10s.png) | play9.99994 → 10.4583 | 緑の○・ハート・理由と「小寒」。○が日付の一部へ重なる |
| [play30秒](play-30s.png) | play30.0004 → 30.4083 | 1月9日「サギが一羽」、二択と手本、「田おこし まえ・雨」 |
| [play60秒](play-60s.png) | play60.0004 → 60.8736 | 1月16日「田んぼの猫」、二択と手本。右札の末尾は折り返して枠内 |

10秒写真の近傍DOMは1月5日だが、写真の日付全字を読めたとはしない。○と理由が見える1場面を、最初の成功時刻・重なりの頻度・持続的な読めなさへ置き換えない。60秒の状態語や理由帯は写真では読めず、直前の`whyOn=true`だけを可視写真の証拠にしない。初期写真に指がないことも、手本が動作しない証明ではない。

次の大きい農作業の近さや、理由と次の手本の関係は引き続き設計上の検討候補。箱・点・稲列の非表示という[既決 index.html:441](https://github.com/shota0617/ricepia-judge/blob/15a9308c0ffeb7e2ad28de91fcc8136888450862/kome365/index.html#L441)や、理由の位置・2秒という運営判断には変更を加えない。R110の理由帯と手本の競合候補も、今回の4枚から頻度や新規欠陥を作らない。0.3秒手本・素早いスワイプ・タップ非選択・初カードの影・30秒カード・音・かかし・太陽も維持。既存UIの引用だけを記録し、農業の新しい事実は加えていない。[カード文言 cards.js:584](https://github.com/shota0617/ricepia-judge/blob/15a9308c0ffeb7e2ad28de91fcc8136888450862/kome365/cards.js#L584)、[理由文:453](https://github.com/shota0617/ricepia-judge/blob/15a9308c0ffeb7e2ad28de91fcc8136888450862/kome365/cards.js#L453)、[写真中の理由文:483](https://github.com/shota0617/ricepia-judge/blob/15a9308c0ffeb7e2ad28de91fcc8136888450862/kome365/cards.js#L483)を参照。

再確認の入口は同じ画面で、可視手本または同カードの履歴から左へ100pxを要求120msで送る手順。入力処理は[index.html:4034](https://github.com/shota0617/ricepia-judge/blob/15a9308c0ffeb7e2ad28de91fcc8136888450862/kome365/index.html#L4034)、距離判定は[4044行](https://github.com/shota0617/ricepia-judge/blob/15a9308c0ffeb7e2ad28de91fcc8136888450862/kome365/index.html#L4044)。今回の通常入力から、短斜め・別指・背景復帰・カード外開始の成否を推論しない。R110の診断結果も今回の回数へ足さない。

プレイ実コマンドは`node /workspace/scratch/first-minute/round-114/preparation-15a9308c/run.cjs`、実exit1。consoleに`Failed to load resource: the server responded with a status of 404 (File not found)`が2件。ResourceTimingには`http://localhost:8000/favicon.ico`の404が2件あるが、consoleにはURLがなくrequest IDでの対応は未確立。driverエラー0、CPU復帰・ブラウザ閉鎖と残存runtime0を確認した。指定5ファイルのlocal/HTTPを開始前、localを終了後に照合し、保護3ファイルを含め不変。全資産の前後検証ではない。

`pytest tests/`は実exit127、原文 `/bin/bash: line 1: pytest: command not found`でsuite未実行。製品修正対象が確定せず、固定10回再現・追加回帰テストのRED/GREEN・製品の変更前後比較・修正後5サイズ比較は未実施。既存テストを変更せず、他のゲーム/周の検証結果を混ぜていない。

指定動画は未再生。[本人記事](https://www.famitsu.com/news/201705/17132636.html)と[英語第三者OCR](https://github.com/flossbud/sakurai-game-design/blob/main/episodes/transcripts/100-development-secrets-of-the-original-kirby.md)を、入力成立・肯定・次の一手を分ける判断軸の参考にした。実指・センサー・回線・音・人の理解と離脱率は未確認。終了後の音/3D debug値を実際の聞こえ方や実機性能としない。

数・SHA・原証拠識別子は[results.json](results.json)。scratch識別子は公開リンクではない。検証後の`704157676f89669ed956ff60c7550812358efd39`への更新はR113資料6ファイルだけ。測定sourceは上記15aで、後続の資料追加HEAD全体を再検証したわけではない。全テスト合格や離脱率の改善は主張しない。
