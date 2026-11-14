# 米づくり365：844×390での最初の1分

**8入力すべてにdrag/変形/日送りを記録し、送信済み無反応0。新規修正候補0件、製品・テスト変更0。初回答後の長い待ちは[既知R118/PR1177](https://github.com/shota0617/ricepia-judge/pull/1177)として保持する。** 今回は新しい固定10回や原因profileを行っておらず、改善効果・離脱率も測っていない。

測定source `838b7df8da3cefbb98e6cf161d0a45b552a63c84`、844×390・CPU1・新しいローカルChromium/context・isMobile/hasTouch。最上位の `python3 -m http.server 8000` から `/kome365/index.html` を開き、外部要求を遮断、手元のthree r128を使用。10秒無操作→写真保存→60秒、CDP `Input.dispatchTouchEvent`で現在または同じカードの手本に従った。

19機会のうち8送信・11未送信。理由onクラス＋文字8、文字変更8、○5/✗3、1月1日→9日。右1回→左7回、現在の手本3・同カード履歴5で、左右や成否を揃えた実験ではない。11未送信は方向を確定できなかった瞬間で、無反応入力に加算しない。手本DOM可視false7/true4、全11回に後続の同カードの明確なcueがあるため、永久消失とも言わない。

今回の初右→✗、次左→✗は選択と理由のDOM記録が対応し、手本は共通の左右周期だが、[初日の最初の左動作を正解側に合わせた既知調整](https://github.com/shota0617/ricepia-judge/blob/838b7df8da3cefbb98e6cf161d0a45b552a63c84/kome365/README.md#L1382)もある。10秒観察後の位相はその最初の動作の回帰試験ではなく、提供資料を「毎回正解へ誘導する指示」とせず、手本の受け取られ方は運営者の判断へ残す設計候補とする。

| プレイ時計 | DOMで記録されたこと |
|---|---|
| 0.251秒 → 0.3207/0.3334秒 | 初入力→drag69.7ms/transform82.4ms |
| 0.8302/0.8364秒 | 翌日進行/✗理由on＋文字（初入力から579.2/585.4ms） |
| 2.7105秒から7688ms | 既知待ちのlongtask |
| 10.4089 → 11.6837秒 | 次のguideクラスtrue→同カードの明確な左方向cue |
| 19.3241秒 | 3手目で最初の○理由on＋文字、初入力から19.0731秒（その入力から1121.1ms） |

longtask7688ms、RAF間隔7716.9ms、status読取往復7781.1ms、Node heartbeat最大315.2msは別の記録/時計で、同じ待ち時間へ合算しない。初日送り→明確な次cueは10.8535秒。待ち中の追加入力はなく、入力消失とは数えない。この周には関数帰属を得るprofileがなく、縦画面R118との差を修正の効果にしない。[開始予約 index.html:970](https://github.com/shota0617/ricepia-judge/blob/838b7df8da3cefbb98e6cf161d0a45b552a63c84/kome365/index.html#L970)、[回答時:3919](https://github.com/shota0617/ricepia-judge/blob/838b7df8da3cefbb98e6cf161d0a45b552a63c84/kome365/index.html#L3919)。保護されたfield3dの処理分割などは前周の運営判断として残し、変更していない。

64CDP命令全ACK、trusted pointer29（down8/move13/up8）。120ms要求の実送信幅120.31–122.08ms、event→handler53.4–938.5msを分離する。最終入力55.097秒→解除55.219秒。最後のmark off標本が59.9874秒で、終了時guide=falseを持続欠落の証拠にはしない。

| 原写真（変更前後ではない） | 要求→保存完了 | 原画の表示 |
|---|---|---|
| [観察10秒](observe-10s.png) | 観察10.001→10.200秒 | 1月1日・左右選択肢、左の田と状態語。指は写らない |
| [play10秒](play-10s.png) | 10.001→11.421秒 | 1月2日・左右選択肢・手本、田おこしまえ・雨 |
| [play30秒](play-30s.png) | 30.001→30.742秒 | 1月5日・左右選択肢、田おこしまえ。指は写らない |
| [play60秒](play-60s.png) | 60.008→61.128秒 | 1月9日・左右選択肢、田おこしまえ。指は写らない |

原4PNGは無加工。日付・左右選択肢・左の状態語は読めるが、○✗/理由帯は写らないため、理由の連続可読2秒や表示中の非重複を保証しない。初回why on/off差9590.8msも可視時間ではない。写真保存199.1msを含む観察→play10.2165秒、play10写真の保存待ち1419.7msは入力遅延へ加算しない。カード名/農作業の語句は[既存cards.js:584](https://github.com/shota0617/ricepia-judge/blob/838b7df8da3cefbb98e6cf161d0a45b552a63c84/kome365/cards.js#L584)などのUI引用で、新しい農業事実を加えていない。

通常実outer exit1、console404×2。別ResourceTimingにfavicon404×2を記録したがrequest ID結合はなく、同一要求と断定しない。CPU復帰・ブラウザ閉鎖・指定source7/環境8一致を確認。`pytest tests/`は実exit127、`/bin/bash: line 1: pytest: command not found`でsuite未実行（実tool出力の転記log）。固定10回・新profile・RED/GREEN・修正後再現・5サイズ前後比較はこの周で未実施、他周の件数を足さない。

理由2秒・日付/選択肢を避ける位置調整・最初3枚の次カード後保持、0.3秒手本・素早いスワイプ・音・かかし/太陽を維持。速い連続選択での初3枚保持や全サイズ/回転は、この通常1画面では未検証。engine/field3d/cardsの保護3ファイルも変更していない。

提供部分文字起こし（本文75節・未完了35節）の[反応](https://www.youtube.com/watch?v=EDs5n39sRFc)・[肯定](https://www.youtube.com/watch?v=1xRDwQqSn6I)・[自然な導入](https://www.youtube.com/watch?v=L1Su0aajYFA)・[近い目標](https://www.youtube.com/watch?v=rA_FN6BTGms)を評価基準に用い、応答/肯定/次手本/待ちを分けた。既存入力手順は変えず、未完了内容は補わず、動画本体は未再生。実指・傾き・回線・音・物理paint・人の理解と離脱率は未確認。

測定838bから検査後base `2f3fbcc8bee32850e7c51e88113a43a2cf8d9e5f` への更新はR121資料6ファイルのみ、指定source7は同byte。資料追加後HEAD全体を検査した結果とはしない。原証拠識別子/SHAは[results.json](results.json)、scratch識別子は公開リンクではない。通常プレイの観測と既知の待ちの記録であり、新しい製品変更の合格報告ではない。
