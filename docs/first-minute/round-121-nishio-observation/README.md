# にしおさんぽGO：390×844での最初の1分

**通常プレイ10入力すべてに座標変化があり、1100ms窓内の反応未記録0。新規修正候補0件、製品・テスト変更0。全Node検査は不合格。** 10到達・10正解や人の離脱改善とは数えない。

測定source `077bc2809bbf032605177d48cce369d5ed970aea`。最上位の `python3 -m http.server 8000` から `/nishio-go.html` を開き、新しいローカルChromium/context、390×844、CPU1、isMobile/hasTouch、CDP `Input.dispatchTouchEvent`で1回遊んだ。Leaflet1.9.4を手元へ差し替え、外部要求は遮断/ローカル応答。10秒無操作→写真保存→60秒、見える手本に従った。

| プレイ時計 | 記録されたこと |
|---|---|
| 0.020秒 → 0.1344秒 | 初入力→座標変化の初観測、114.4ms |
| 0.3357秒 | 可視・中心遮蔽なしの30ポイントをDOM観測、初入力から315.7ms |
| 19.2469秒 | 保存goal=1を初観測、駅前の学生の名・72m |
| 20.4104秒 | 旧名・48mのまま、goal1後の手本を可視DOMで初観測 |
| 21.7681 → 21.8307秒 | 異なる次名の初標本0m→同名の非ゼロ距離2.3km |
| 59.9994秒 | 最後の保存標本goal1・547ポイント、次名2.2km |

保存goal1→手本再表示1.1635秒、→異なる名2.5212秒を分ける。手本が旧名の到着フィードバック中に戻ることや、次名の一瞬の0mを、新しい不具合・2つ目の到達とは認定しない。10窓の座標変化、8窓の点数変化、1窓のgoal変化は別の観測。距離の丸め・自動歩行もあり、入力ごとの目的達成を保証しない。

初回手本1＋通常手本9、world/info/帰還0。別に9入力窓で手本の非表示→再表示があるが、全て座標反応より後のUIフィードバックで、反応数や前進へ加算しない。未送信待機は独立計数されず不明。20CDP命令全ACK、trusted down/up/click各10。40ms要求に対し実送信39–43ms、最終入力54.764秒→解除54.803秒。期限の記録は予定より1ms後、trace停止60.2049秒・報告保存66.089秒を追加プレイ時間へ含めない。

| 原写真（変更前後ではない） | 要求→保存完了 | 原画の表示 |
|---|---|---|
| [観察10秒](observe-10s.png) | 観察10.000→10.155秒 | 傾き/タップの案内と手本、名鉄 西尾駅408m |
| [play10秒](play-10s.png) | 10.001→10.153秒 | 33ポイント、同じ行先456m、矢印と旗 |
| [play30秒](play-30s.png) | 30.001→30.144秒 | 381ポイント、観光ボランティアガイドさんと一部省略された場所名、2.7km |
| [play60秒](play-60s.png) | 60.001→60.188秒 | 547ポイント、同じ案内2.2km |

原4PNGは無加工。観察→10秒は点数が増えても表示距離408→456mなので、加点を接近へ置き換えない。30/60秒は人物名が読める一方、括弧内の場所の後半は省略される。保存DOMの全文が全て可読とはせず、[既知PR1147](https://github.com/shota0617/ricepia-judge/pull/1147)の表示優先順位に関わる領域として重複修正しない。[行先表示 game.js:2510](https://github.com/shota0617/ricepia-judge/blob/077bc2809bbf032605177d48cce369d5ed970aea/nishio-go/game.js#L2510)、[style.css:517](https://github.com/shota0617/ricepia-judge/blob/077bc2809bbf032605177d48cce369d5ed970aea/nishio-go/style.css#L517)。地名・距離は既存UIの引用で、新しい地理的事実を加えていない。

今回worldが開かなかったことを[PR1133](https://github.com/shota0617/ricepia-judge/pull/1133)解決の証拠にせず、帰還操作がないので[PR1156](https://github.com/shota0617/ricepia-judge/pull/1156)の戻り案内も未評価。情報窓末尾・遅延/失敗ロード・複数指・背景復帰・ペン・破損保存はこの通常プレイで未検証。[既存の手本処理 pixel.js:9724](https://github.com/shota0617/ricepia-judge/blob/077bc2809bbf032605177d48cce369d5ed970aea/nishio-go/pixel.js#L9724)の全分岐が通ったとはしない。

通常プレイ実child/outer exit0、記録エラー0、CPU復帰・ブラウザ閉鎖・指定source10/配信5の前後一致。外部URL4件の遮断は接続成功やゲームエラーではない。全`node tools/playtest.js`は253群中224明示成功（ok=true181＋直接true43）・9失敗・20独立boolean判定なし。実child/outer exit1、errors配列0でも全体は不合格。20は複合判定に使う値で、成功や未実行へ数えない。対象325ファイル（tests310を含む）/依存550は実行前後同byte、閉鎖確認済み。`pytest tests/`は親の再確認実行で実exit127（chunk18c4e7）、`/bin/bash: line 1: pytest: command not found`、suite未実行。実tool出力の転記logと再確認事情を記したreceiptを保持した。

9失敗の原値・判定位置は[results.json](results.json)。例えば `tapDemoQuick` は7標本の中央値3128msで1700ms未満の条件を外れ、`infoSecondTap` は最初の窓が開かなかったため、窓内フォームの誤押下を確認した結果ではない。`speedLines` はspeedKの標本最大値0で禁止線の出現を記録せず、移動距離の条件不足。R117から新falseはなく、`roll`/`worldBackDemo`/`infoRotate`は今回はtrueだが、別実行の差を修正効果や離脱改善とせず、今回の必須検査不合格は保持する。

製品変更がないため固定10回・追加テストのRED/GREEN・修正後再現・5サイズ前後比較は未実施。異なる周/画面での入力数や時間を改善効果として比べない。運営の傾き許可・許可前/停止中の手本・開始画面なし・到着カードなしを維持する。

提供部分文字起こし（本文75節・未完了35節）の[反応](https://www.youtube.com/watch?v=EDs5n39sRFc)・[肯定](https://www.youtube.com/watch?v=1xRDwQqSn6I)・[自然な導入](https://www.youtube.com/watch?v=L1Su0aajYFA)・[近い目標](https://www.youtube.com/watch?v=rA_FN6BTGms)を評価基準に用い、反応/30ポイント/保存goal/旧名の手本/次名を分けた。入力手順は変えず、未完了内容は補わず、動画本体は未再生。資料適用だけで製品が改善したとはしない。実指・センサー・回線・音・物理paint・人の理解と離脱率は未確認。

数・SHA・原証拠識別子は[results.json](results.json)。scratch識別子は公開リンクではない。測定sourceは上記HEADで、後続mainや資料commit全体の検証へ置き換えない。全検査閉鎖後の公開base `838b7df8da3cefbb98e6cf161d0a45b552a63c84` への更新にはR120資料6ファイルと別途マージされたトラクター3ファイルを含み、資料だけの更新ではない。今回の325対象・にしお/toolsは同byteだが、新しいトラクターや新main全体をこの周で検査した結果ではない。
