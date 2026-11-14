# 検査ゲーム：320×568での最初の1分

**35入力すべてに操作後のDOM反応を記録し、記録された無反応は0。新しい修正候補は0。** 作業・部分更新34件と、既知のズーム表示更新1件を分けた。製品・テストは変更していない。

測定source `4eab5db22688eb264948621aa5aac5b4e9fa9dad`。リポジトリ最上位の `python3 -m http.server 8000` から `/kensa.html` を開き、作業場Chromium、320×568、CPU1、isMobile/hasTouch、CDP `Input.dispatchTouchEvent`で1回遊んだ。10秒無操作→原写真保存→画面の手本に沿って60秒。外部サイトには接続せず、内部工程や粒の種類を入力選択に使っていない。

| プレイ時計 | 記録されたこと |
|---|---|
| 0.010→0.427秒 | 初入力→操作後のDOM poll、417ms（400msの入力動作を含む） |
| 3.352秒 | 肯定「ちょうどいい」の可視条件付きpoll。初入力から3.342秒 |
| 6.087 / 8.299秒 | 最初の粒除去 / 選別完了文「きれいに なった！」のpoll |
| 15.245–15.248 / 37.727–37.730秒 | 押印後、次の袋へ進める状態をsnapshotで確認 |
| 16.9035 / 39.4035秒 | 袋送り手本のclass＋opacity標本。その入力は16.967 / 39.448秒 |
| 17.530 / 40.010秒 | 袋送り操作後、次袋の「穀刺しを ふくろへ さす」案内をpollで確認 |

35反応は35工程完了ではない。34件の作業・部分更新には計測回数や粒1つの除去も含む。肯定文5件も心理的な報酬の回数ではない。可視条件付きDOM pollを実描画・人が読めた時刻にはしない。文字traceの初肯定3.2039秒は可視条件なしの別記録。次ボタン、袋送り手本、次袋の挿入案内を同じ初出時刻にしない。押印後に入力を送っていない待ちを無反応へ足さない。[手本待ち kensa.html:2666](https://github.com/shota0617/ricepia-judge/blob/4eab5db22688eb264948621aa5aac5b4e9fa9dad/kensa.html#L2666)。

手本press10回は粒減少＋飛ぶ粒9回、ズーム成功1回。47.608秒のaction30では「わるい粒を つまむ」の手本先がzoomBtnで、🔍→➖、粒20→20だった。[既知PR1160](https://github.com/shota0617/ricepia-judge/pull/1160)の追加観測として重複修正しない。[フォールバック kensa.html:2700](https://github.com/shota0617/ricepia-judge/blob/4eab5db22688eb264948621aa5aac5b4e9fa9dad/kensa.html#L2700)。

490CDP命令全ACK、trusted touch pointerイベント502（down36/move430/up36）。操作後pollの650msは最大予算で、反応を記録したら早く終了する。全35件の最大予算は60秒内に収まるが、各650msを観測し続けた意味ではない。未送信・抑止の総数は記録しておらず不明。観察後の写真保存78msは入力応答時間へ足さない。

| 原写真（変更前後ではない） | 要求→保存完了 | 原画の表示 |
|---|---|---|
| [観察10秒](observe-10s.png) | 観察10.000→10.078秒 | 1ふくろめ・ぬく、穀刺し右端の指、挿入案内 |
| [play10秒](play-10s.png) | 10.000→10.055秒 | 1ふくろめ・みわける、顔の下の両手マーク、「はなへ はこぶ」 |
| [play30秒](play-30s.png) | 29.999→30.019秒 | 2ふくろめ、拡大粒・➖・粒取り文。明瞭な指は写らない |
| [play60秒](play-60s.png) | 60.000→60.015秒 | 3ふくろめ、緑粒・➖・粒取り文。明瞭な指は写らない |

原4PNGを本人実見し無加工で保持した。30秒の要求は予定より1ms早い。両手の静止画を運搬途中と断定せず、30/60秒の指不在やトレー端の粒の切取りを持続的な欠落・新規回帰へ読み替えない。肯定文・証印・次ボタン・炊き上がり通知の瞬間は4枚に写っていない。工程名・検査の文は既存UIの引用で、新しい検査事実は加えていない。最後のtrace標本60.2036秒は窓外の保存記録で、追加プレイに数えない。

通常プレイは実outer exit0、要求exit0、子の実exitは別観測なし。console/page/入力/写真エラー0、CPU復帰・閉鎖・source10/shared5保持を確認。`pytest tests/`は実127（`/bin/bash: line 1: pytest: command not found`）でsuite未実行。固定再現10回、追加回帰テスト、RED/GREEN、修正後再現、5サイズ比較は未実施。製品変更がなく、改善前後の数も測っていない。

運営者の判断として保護される初回タップ、つまむ／きめるの進行、45秒カード、見せる遊びの形を変更しない。初袋完了前のカード抑止・初袋空振り2回の決定も維持し、他工程へ拡張しない。救済・再案内・初袋未完了の45秒待ち・押印後1秒境界・回転を狙った試験は未実施。[規則](https://github.com/shota0617/ricepia-judge/blob/4eab5db22688eb264948621aa5aac5b4e9fa9dad/AGENTS.md#L30)、[初袋条件](https://github.com/shota0617/ricepia-judge/blob/4eab5db22688eb264948621aa5aac5b4e9fa9dad/kensa.html#L1159)、[カード条件](https://github.com/shota0617/ricepia-judge/blob/4eab5db22688eb264948621aa5aac5b4e9fa9dad/kensa.html#L2807)。

提供部分文字起こし（本文75節・未完了35節）の[反応](https://www.youtube.com/watch?v=EDs5n39sRFc)・[肯定](https://www.youtube.com/watch?v=1xRDwQqSn6I)・[短い手本](https://www.youtube.com/watch?v=L1Su0aajYFA)・[近い目標](https://www.youtube.com/watch?v=rA_FN6BTGms)を評価基準に用いた。動画本体は未再生。実指・傾き・回線・音・物理描画・人の理解と離脱率は未測定。数と原証拠識別子/SHAは[results.json](results.json)。scratch識別子は公開リンクではない。

測定sourceは `4eab5db22688eb264948621aa5aac5b4e9fa9dad`。検査後の中間base `7a17d1c7c458539c1e5d6b6b65c29d1e9f2958b3` への更新はR130資料8ファイルのみだった。その後の公開base `91f91d80e869cd4e370988db523b6aa7463b0304` には、にしおの配信用コピー・HTML、tools/tests、作業手順の変更も含まれ、資料だけの更新ではない。検査ゲーム本体・AGENTS・保護対象3ファイルは測定版と同byteだが、作業手順のskillは異なる。新しい公開HEAD全体や取り込んだ変更を再検査した記録ではない。
