旧新 repeat10 の独立ペア監査を確定。固定 controller/frozen と byte 同一のオフライン集計コードを使い、各版 10 試行を別母数として確認した。旧 raw/report/監査一式は変更していない。root 新 actual exit 0（b5c1d5）、新 report SHA 2e2e261825a232244cfe0fd4846338c478dd05bf57e8c97a9d78d87f48f5e82d と receipt を照合。

| 版 | 完了試行 | 対象到達 | 未到達 | 対象原PNGで完全場所名が読めない |
| --- | ---: | ---: | ---: | ---: |
| 旧 | 10 | 6 | 4 | 6 / 6 |
| 新 | 10 | 6 | 4 | 0 / 6 |

旧の対象は 1,2,5,7,8,9、新は 1,3,4,5,6,8。対応する trial や自然経路が一致したとは呼ばない。各版の未到達 4 件を「不具合なし」に数えず、pilot も本番へ合算しない。10 件すべてで対象不具合を再現/解消した結果ではない。

終端原 PNG は旧新各 10 枚、すべて実見。旧の対象 6 枚は「観光ボランティアガイドさん（西…」で完全場所名が読めない。新の対象 6 枚は「西尾市歴史公園（西尾城跡）（観…」となり、完全場所名と距離 2.3km を読めた。人物名の後半には省略が残る。新の未到達 2,7,9,10 はいずれも「伊文神社（氏子のおばあさん）1.4km」の終了画像で、対象の省略判定には使わない。

対象の旧新全 12 件、写真前後計 24 診断で文字数・文字集合・name 矩形・font・clientWidth 235 / scrollWidth 380・1 行が一致。主名の順序が変わり、NPC/spot metadata は同じ。停止時主名と写真前後の文字列一致・両 literal・可視性を独立に再計算して原報告と一致した。これは同一画面寸法の表示比較であり、描画時刻・自然経路・reward が一致した主張ではない。Range は描画前の座標で、可読範囲は原画像で確認した。

両版とも 62 可視手本入力、trusted pointerdown/up/click 各 62、開始終了 ACK 各 62、期限後の新入力 0。新 40ms 指定群は 5 試行/31 操作、Node 実保持 39～44ms / eventTimeStamp 差 38.9～44.0ms / listener 差 1.3～63.9ms。新 200ms 指定群は 5 試行/31 操作、Node 200～205ms / eventTimeStamp 199.9～205.0ms / listener 72.4～247.5ms。指定値を実保持時間と同一視せず、CDP timestamp と受信間隔も分ける。旧の各範囲は paired-audit.json に保持した。到達数や経過秒を速度・離脱改善の証拠にしない。

両版で page/console、入力、写真、診断、request failure、HTTP、lifecycle のエラー 0。旧新計 20 browser の閉鎖、各 root receipt の残存 0。source18/environment16/HTTP8 の前後計 40 gate が各 binding と一致。変わった source pin は game.js/min/game.js の 2 件だけで、env16/HTTP8対象と frozen controller は不変。既存 test205 の固定 SHA を含む他 16 source pin は同一。単体回帰・既存テストの成否や 5 サイズ評価はこの自然再現監査とは別資料。

実見は旧終端 10＋新終端 10＋別 pilot 2＝22 原 PNG。旧新 observe-10s 各 10、計 20 枚は未実見。20 試行の写真計 40 枚は raw SHA と一致を確認したが、SHA 照合と実見は別。製品/原記録/画像は編集せず、当方の Node・parse・ブラウザ・テスト・HTTP・Git 実行は 0。人の理解・離脱率・実機センサー/指・聴取は未測定。

代表として old-repeat10/trial-01/target.png と new-repeat10/trial-03/target.png を並べられる。どちらも対象場所の案内で、同一 frame や一対一経路一致の比較とは説明しない。
