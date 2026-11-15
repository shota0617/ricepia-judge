# R146 long-date fixture 独立監査

保存済み原データの独立再集計と原 PNG 実見。新しいゲーム実行、Node、ブラウザ、HTTP、Git、製品・テスト編集は 0。Python は保存済み JSON の再計算とこの監査ファイル作成だけに使用した。

- 元結果: `../long-date-fixture-prep/run-new-01/report.json`、SHA256 `d68adc02619ae576bf2316a8745190b7928550da4182c2e80b0bb370e65c4ea5`。
- 対象 HTML: `0186cfdb92297e810ef66cf93890b98816ce30ff35751eb234926167e88648e7`。binding `72c78a32fcfce64769d00ea6be2f320a793101f8d04cded06cb2a75fbfdff674`。
- 844×390 / 568×320 / 564×440、各 normal / gold / fest / goldfest。12ヶ月×31日を各条件で測定した 12×372 = 4,464 行。2月31日等は非実在日付を含む字幅ストレスであり、自然日送りの再現数ではない。

## 再計算

`recount.py` が元 rows 12 ファイルの全行を読み、文字ごとの矩形対左右矢印、他8対象対左右矢印の交差面積と最短距離を保存座標から再計算した。`geometry-audit.json` に表ごとの数と SHA を保存した。

| 指標 | 独立再計算 |
| --- | ---: |
| 行数 / valid / unknown | 4,464 / 4,464 / 0 |
| 日付矩形の比較数 | 44,280 |
| 他8対象の矩形比較数 | 258,912 |
| 日付交差行 / 他対象交差行 / 他対象測定欠落行 | 0 / 0 / 0 |
| 元の valid / 幅 / 交差 / 距離との不一致 | 0 |
| 全条件の日付最大幅 | 205.828125px |
| 全条件の日付最小余裕 | 1.078125px |
| 田んぼ箱との最小余裕 | 14px |
| 田んぼの状態文字との最小余裕 | 22.4375px |

最長幅の代表は全条件とも `10月10日`。同幅の複数日付も全件計算している。矢印は全行で 70×54px / 40px / animation:none、両矢印と全日付文字が viewport 内。8対象は title、左右選択肢文字、paddy、paddyword、home、sound、停止指。paddy と指の `centerOwned:false` は非操作表示を含む診断値であり、操作不能件数にはしていない。

## 原画像と復元

15 PNG の全 SHA と寸法を照合。重複 SHA は 0、全15枚を `view_image` で原寸画像として実見、未見 0。各サイズの初期 `1月1日` と4クラスの最大幅日付を確認した。丸矢印は日付の左右に残り、日付・題名・左右選択肢・田んぼ表示・音・ホーム表示を覆う箇所は見当たらない。最大日付の左右余裕は小さく、見た目を定量値の代わりにはしていない。

撮影前後の15組について、日付と18要素の文字・クラス・矩形・可視性・font・transform・文字矩形が同一。元 PNG の目視所見、SHA、寸法は `metadata-audit.json` の `images` に記録した。

表測定12回＋最大幅撮影12回の exact DOM 復元24/24一致。各 context 終了時は既に復元済みで追加書き込みなし (`attempted:false`) の再確認3/3一致。元日付 `1月1日` と元クラス `season-wi enter hinting` を保持し、保存対象のキー/値集合3/3が完全一致。trusted入力0、製品内部の untrusted `bStart` click が各context1件で計3件、観測ログ dropped0。未操作なのでプレイヤーの入力成功率を示す値ではない。

準備7・binding1・source7・env8・HTTP前後10・rows12・PNG15、計60 SHA照合すべて一致。source/envの実行前後一致、context閉鎖/CPU reset3/3、browserClosed:true。rootの実行直後ゲートに残存browser0の記録がある。監査中の現在のプロセス状態は確認していない。

## エラーと証拠の境界

実終了コード1を保持。console errorは favicon.ico 404 の1件、warningは preload未使用の6件。page error / request failure / HTTP error配列 / blockedはそれぞれ0。この記録から正常終了0とは言わない。

元 `root-closure.json` の `gateAfter` は repeat runner の共通 source7/env8/HTTP5/server/live0 ゲート。そこに含まれる別 binding と prepared8/parse は fixture 自体の束縛証拠には使わない。fixture prepared7 と binding は独立照合し、固有 parse3 は `root-execution-gate.json` を参照する。root は原 closure を保持して `root-closure-clarification.json` を追加した。現 closure SHA `041dec173cc4ed6b10bc463531d2e9b5fda21db1a04b58601a68a0b0a1a44678`、clarification SHA `f62fec02e2b9edb92650be84c4b62224029ebd22c646eb0e87169bc4f7c1d517`。メッセージ中の短い `569ec5` はファイルSHAとして採用していない。

表の372状態は同一 evaluate 内で DOM の日付文字とクラスを差し替え、同期レイアウトを読んだもの。4,464状態すべてが物理的に画面へ描画された証明ではない。原PNGが対応するのは15状態であり、診断前後同値でも同一描画フレームの原子性は保証しない。DOM fixtureは日付文字/カードクラスのみで、ゲーム内日付・状態・保存・時計は差し替えていない。自然な特別カード到達や保存再開の証明とは区別する。

日付以外の題名・選択肢・paddyword は初期表示のまま。全季節の長い題名や pd4 の二行状態文を実測したという主張はしない。現在の Chromium/fontfallback/DPR1 における最小余裕であり、実機の別フォントや拡大文字に一般化しない。人の理解・離脱率は未測定。

本物のライブラリと既存音経路は無置換・ファイル一致。初期診断は THREE revision/debug:null、音ON:trueだがAudioContext空・BGM:false。したがってこの無入力fixtureは3D稼働や実音聴取を証明しない。

## 添付量

元 rows 12ファイルは合計25,335,102 bytes。元を残して別コピーを gzip し、解凍後SHAが本監査の各 rows SHA と一致する手順は lossless 添付候補になる。今回の依頼は監査優先のため、圧縮コピー作成・原ファイル変更はしていない。

補助担当は独立して60 SHA、復元/保存/入力/撮影前後/閉鎖を確認した。全行の座標再計算と15原PNG実見は本監査担当が行った。
