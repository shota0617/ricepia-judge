# にしおさんぽGO：844×390での最初の1分

**通常プレイから選んだ新規修正候補0件、製品・テスト変更0の観察報告。全Node検査は完了し不合格。** 20入力すべてで反応を記録し、1100ms観測窓内の無反応は0。内訳は座標変化18・世界地図表示1・戻る1。初入力から座標変化の観測まで138.4ms、最初の可視30ポイントまで385.3msだった。反応は意図どおりの前進を保証せず、人の離脱率や改善効果も測っていない。

測定sourceは `3844ff5998e04507f6d9aadbc66fcc06cd89cb4f`。最上位の `python3 -m http.server 8000` から `/nishio-go.html` を開き、ローカルChromium、新しいcontext、844×390、CPU1、isMobile/hasTouch、CDP `Input.dispatchTouchEvent` で1回遊んだ。Leaflet1.9.4は手元へ差し替え、他の外部要求は遮断/ローカル応答。10秒無操作→写真保存→60秒の入力時計で、見える手本と戻るボタンに従った。

| プレイ時計 | 記録されたこと |
|---|---|
| 0.022秒 → 0.1604秒 | 初入力 → 座標変化の初観測（138.4ms） |
| 0.4073秒 | 可視・中心遮蔽なしの30ポイントをDOM観測（初入力から385.3ms） |
| 16.6669秒 | 保存goal=1の初guide標本 |
| 60秒まで | 初回手本1＋通常手本18＋戻る1。情報窓0、最後の保存点数346 |

40CDP命令全ACK、trusted down/up/click各20。要求保持40msに対し実送信39–43ms。20入力すべてで1100ms観測窓が成立し、最終入力は57.942秒、指を離す送信は57.981秒。反応・点数・保存goalは別の観測で、点数とgoalを同じ報酬へ合算しない。DOM時刻は正確な加点や物理paintの時刻ではない。

原写真はこの1回の無加工PNGで、変更前後比較ではない。

| 原写真 | 要求 → 保存完了（各時計の秒） | 原画の表示 |
|---|---|---|
| [観察10秒](observe-10s.png) | 観察10.000 → 10.144 | かたむけて ころがす／タップ！、名鉄 西尾駅408m |
| [play10秒](play-10s.png) | play10.000 → 10.120 | 31ポイント、同じ行先240m、矢印と旗 |
| [play30秒](play-30s.png) | play29.999 → 30.131 | 282ポイント、次の行先2.6km、左向き矢印と旗 |
| [play60秒](play-60s.png) | play60.000 → 60.158 | 346ポイント、同じ行先2.4km、左向き矢印と旗 |

30秒写真の要求は29.999秒で、正確な30秒瞬間ではない。入力期限到達の保存値は設定時刻と一致した。trace停止60.1671秒、報告保存64.529秒を追加のプレイ時間へ数えない。30/60秒は人物名「観光ボランティアガイドさん」に加え、場所「西尾市歴史公園（西尾城跡）」と距離が読め、今回の原画で名称の省略を認定しない。全サイズ・全場面の可読性や押下可能性は保証しない。地名・距離は既存UIの引用で、新しい地理的事実は加えていない。参照は[行先表示 game.js:2510](https://github.com/shota0617/ricepia-judge/blob/3844ff5998e04507f6d9aadbc66fcc06cd89cb4f/nishio-go/game.js#L2510)と[style.css:517](https://github.com/shota0617/ricepia-judge/blob/3844ff5998e04507f6d9aadbc66fcc06cd89cb4f/nishio-go/style.css#L517)。

手本入力で世界地図が開いた操作3は[既知PR1133](https://github.com/shota0617/ricepia-judge/pull/1133)の範囲。操作4で戻った後の保存toast文字列は世界地図の案内だが、可視CSSを保存していないため、[既知PR1156](https://github.com/shota0617/ricepia-judge/pull/1156)の可視残留を新たに再現したとはしない。[世界地図入口 pixel.js:13928](https://github.com/shota0617/ricepia-judge/blob/3844ff5998e04507f6d9aadbc66fcc06cd89cb4f/nishio-go/pixel.js#L13928)、[戻り操作:9266](https://github.com/shota0617/ricepia-judge/blob/3844ff5998e04507f6d9aadbc66fcc06cd89cb4f/nishio-go/pixel.js#L9266)。PR1151の複数指、PR1147の名称表示も新発見へ足さない。情報窓末尾、遅延・失敗ロード、複数指、背景復帰、ペン、破損保存は未観測/未実施であり0/10ではない。

自然プレイは実child/outer exit0、記録エラー0、CPU復帰・ブラウザ閉鎖を確認。指定local10ファイルと配信5ファイルの前後一致を確認した範囲であり、すべての資産や全操作状態の保証ではない。

先行する準備ランナー`preparation-3844ff59/run.cjs`の起動は、ログへのshellリダイレクトと排他作成が衝突し、`EEXIST: file already exists, open '/workspace/scratch/first-minute/round-113/preparation-3844ff59/run.log'`で実outer exit1。childとブラウザの起動前に停止しており、自然プレイやゲームの失敗へ加算しない。原記録を保ち、別の`preparation-3844ff59-attempt2`で実施した1回だけが上の観察結果。

`pytest tests/`は実exit127、原文 `/bin/bash: line 1: pytest: command not found`。suiteは実行できなかった。

全`node tools/playtest.js`はchild/outer実1、251群＝明示成功219（ok:true176＋直接true43）・失敗12・独立boolean判定なし20、errors配列0。20群を成功や未実行へまとめない。source322ファイル・依存550ファイルは前後同じ、timeoutなし・自動retry0、ブラウザ閉鎖を確認した。通常の60秒プレーとは別の検査で、errors配列0でも全体は不合格。

R109から失敗集合は変わり、rollとinfoSecondTapが追加、rollNoDemoは今回は失敗でない。同じコード・検査・依存の別実行で、製品の悪化・改善や原因を証明しない。a2hsAutoHideのoff=falseは待機のreject理由が未保存で、後続again=falseなので再出現を断定しない。lowDemoKeptは最初の標本で手本なし・次の標本では表示あり。infoSecondTap/infoRotateは窓を開く前提が成立せず、後続の2回目タップや回転後の押下不良へ直結させない。Godotはerrsなし・shade0、speedLinesはspeedK標本最大値0と移動距離不足であり、広い失敗文にある全症状を観測したとは扱わない。

製品変更がないため、固定10回再現・追加回帰テストのRED/GREEN・修正後再現・5サイズ前後比較は未実施。既存テストは変更していない。他のゲーム/周のテスト結果は混ぜない。

最初の本当のclickによる傾き許可、許可前/停止中の手本、傾き対応、開始画面なし・到着カードなしを維持。本物の指・センサー・回線・音・物理paint・人の理解と離脱率は未確認。前周との入力数や画面の差を改善効果にしない。

指定動画は未再生。[本人記事](https://www.famitsu.com/news/201705/17132636.html)と[英語第三者OCR](https://github.com/flossbud/sakurai-game-design/blob/main/episodes/transcripts/100-development-secrets-of-the-original-kirby.md)を、入力成立・早い肯定・次の一手を分ける判断軸の参考にした。動画で不具合を発見したとはしていない。

数・SHA・原証拠識別子は[results.json](results.json)。scratch識別子は公開リンクではない。測定sourceは上記HEADで、後続の資料commitのHEAD全体を再検証したわけではない。全テスト合格や離脱率の改善は主張しない。
