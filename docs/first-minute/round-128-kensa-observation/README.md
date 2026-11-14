# 検査ゲーム：844×390での最初の1分

**34入力すべてに操作後のDOM反応を記録し、記録された無反応は0。新しい修正候補は0。** 既知のズーム手本と文言の不一致を1件記録した。製品・テストは変更していない。

測定source `3f0a375836cf894bde8084cefb2b2750e4fc0106`。リポジトリ最上位の `python3 -m http.server 8000` から `/kensa.html` を開き、作業場Chromium、844×390、CPU1、isMobile/hasTouch、CDP `Input.dispatchTouchEvent`で1回遊んだ。10秒無操作→原写真保存→画面の手本に沿って60秒。外部部品は不要で、外部サイトには接続していない。内部の工程や粒の種類を入力選択に使わない。

| プレイ時計 | 記録されたこと |
|---|---|
| 0.010→0.432秒 | 初入力→操作後の可視条件付きDOM poll、422ms（400msの入力動作を含む） |
| 3.348秒 | 「ちょうどいい」の可視条件付きpoll。初入力から3.338秒 |
| 6.021 / 8.220秒 | 最初の粒除去 / 選別完了文「きれいに なった！」のpoll |
| 15.297–15.301 / 38.128–38.131秒 | 押印後、次の袋へ進める状態をsnapshotで確認 |
| 17.1044 / 39.9044秒 | 袋送り手本のclass＋opacity標本。その入力は17.223 / 40.055秒 |
| 17.782 / 40.615秒 | 袋送り操作後、次袋の「穀刺しを ふくろへ さす」案内をpollで確認 |

34反応は34工程完了ではない。操作後pollは祖先の可視性・opacity・画面内矩形を調べるが、遮蔽のない実描画・読めた時刻・人の報酬認知は計測していない。100ms周期の文字trace（例：初肯定3.1044秒）は可視条件なしの別記録。次ボタン、袋送り手本、次袋の挿入案内を同じ初出時刻にしない。押印解除から袋送り入力まで新しいtouchStartがない1.937秒の区間が2回あるが、無視された入力でも厳密なタイマー測定でもない。[手本待ち kensa.html:2666](https://github.com/shota0617/ricepia-judge/blob/3f0a375836cf894bde8084cefb2b2750e4fc0106/kensa.html#L2666)。

手本press9回は粒減少＋飛ぶ粒8回、ズーム成功1回。48.141秒のaction30では「わるい粒を つまむ」の手本先がzoomBtnで、🔍→➖、粒20→20だった。[既知PR1160](https://github.com/shota0617/ricepia-judge/pull/1160)の範囲として重複修正しない。[フォールバック kensa.html:2700](https://github.com/shota0617/ricepia-judge/blob/3f0a375836cf894bde8084cefb2b2750e4fc0106/kensa.html#L2700)。2指pinch1回の可視粒20→19は拡大・切取りを含み、粒除去へ加算しない。等級を上48pxへ動かす通常入力は2回、要求450ms・実450/451msで反応したが、速さ別の診断はしていない。

488CDP命令全ACK、trusted touch pointerイベント499（down35/move429/up35）。pressの実送信幅39–41ms、event timestamp→listener1.5–47.4ms。最後の入力は56.895→56.934秒、全34件に解除後650msの観測窓がある。入力されなかった待機・抑止の総数は記録しておらず不明。観察からplayまで10.105秒には原写真保存を含むため、入力応答時間へ足さない。

| 原写真（変更前後ではない） | 要求→保存完了 | 原画の表示 |
|---|---|---|
| [観察10秒](observe-10s.png) | 観察10.001→10.105秒 | 1ふくろめ・ぬく、穀刺しの握り付近の指、下部の挿入案内 |
| [play10秒](play-10s.png) | 10.001→10.062秒 | 1ふくろめ・みわける、顔付近の🤲、下部「はなへ はこぶ」 |
| [play30秒](play-30s.png) | 30.001→30.033秒 | 2ふくろめ・みわける、拡大粒・➖・粒取り文。指は写っていない |
| [play60秒](play-60s.png) | 60.000→60.042秒 | 3ふくろめ・みわける、緑粒上の指・➖・粒取り文 |

原4PNGを本人実見し無加工で保持した。10秒の🤲円は上部目的文の一部に重なるが、下部の現操作案内は読める。30/60秒のトレー端の粒の切取り、30秒の指不在を、新規回帰・操作不能・持続的な欠落と断定しない。4枚に肯定文・証印・次ボタン・炊き上がり通知の瞬間は写っていない。工程名や検査の文は既存UIの引用で、新しい検査事実を加えていない。

通常プレイは実outer exit0、要求exit0、子の実exitは別観測なし。console/page/入力/写真エラー0、CPU復帰・閉鎖・source10/shared5保持を確認。`pytest tests/`は実127（`/bin/bash: line 1: pytest: command not found`）でsuite未実行。新しい固定再現10、追加回帰テスト、RED/GREEN、修正後再現、5サイズ比較は未実施。以前のR124とは製品byteも異なり、今回の値を[PR1179](https://github.com/shota0617/ricepia-judge/pull/1179)の修正効果へ読み替えない。

運営者の判断として保護される初回タップ、つまむ／きめるの進行、45秒カード、見せる遊びの形を変更しない。現在の決定である初袋完了前の45秒カード抑止・初袋空振り2回も維持し、他工程へ拡張しない。今回、空振り救済・初袋未完了の45秒待ち・押印後1秒境界を狙った試験はしていない。[規則](https://github.com/shota0617/ricepia-judge/blob/3f0a375836cf894bde8084cefb2b2750e4fc0106/AGENTS.md#L30)、[初袋条件](https://github.com/shota0617/ricepia-judge/blob/3f0a375836cf894bde8084cefb2b2750e4fc0106/kensa.html#L1159)、[カード条件](https://github.com/shota0617/ricepia-judge/blob/3f0a375836cf894bde8084cefb2b2750e4fc0106/kensa.html#L2807)。

提供部分文字起こし（本文75節・未完了35節）の[反応](https://www.youtube.com/watch?v=EDs5n39sRFc)・[肯定](https://www.youtube.com/watch?v=1xRDwQqSn6I)・[短い手本](https://www.youtube.com/watch?v=L1Su0aajYFA)・[近い目標](https://www.youtube.com/watch?v=rA_FN6BTGms)を評価基準に使った。動画本体は未再生。実指・傾き・回線・音・物理paint・人の理解と離脱率は未確認。数と原証拠識別子/SHAは[results.json](results.json)。scratch識別子は公開リンクではない。

検査後の公開base `9b769fbd797475099448b24172c6f44cd9e20945` への更新はR126資料6ファイルと外部のにしおHTML/テスト/資料を含み、資料だけの更新ではない。検査ゲームの指定source10は同byte。測定sourceは `3f0a375836cf894bde8084cefb2b2750e4fc0106` のままで、更新後HEAD全体や外部変更を再検査した記録ではない。
