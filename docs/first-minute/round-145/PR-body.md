既知NPCの案内札で人物名が先に表示され、内部括弧を含む場所名が省略される場合に、元metadataのid・人物名・spotName・合成名が完全一致するものだけ場所を先にします。`nishio-go/game.js:2507–2510`の4行で、未知名のfallbackやregexは変えません。本文28字・1行・距離優先を保持します。

390×844で10秒観察後、見えている手本に従う自然経路を旧新10回ずつ実行。対象は各6/10、unknown各4/10を取り直さず残し、対象原画像の「場所名全文が読めない」は6/6→0/6でした。人物名末尾は省略されたままです。自然5サイズの同対象pairは820×1180のみです。

|旧：最初の対象trial01|新：最初の対象trial01|
|---|---|
|![旧の場所名省略](https://github.com/shota0617/ricepia-judge/blob/codex/firstminute-round145/docs/first-minute/round-145/images/repeat-old-01.png?raw=true)|![新の場所名先行](https://github.com/shota0617/ricepia-judge/blob/codex/firstminute-round145/docs/first-minute/round-145/images/repeat-new-01.png?raw=true)|

別経路・別frameで、速度/到達率の比較ではありません。追加回帰は旧canonical失敗actual1→新1メソッド21条件成功actual0。必須Nodeは231終端条件中219通過（whole skip3含む）・12失敗、child/outer1/1。既存test205は元byteのまま7pass/1scope fail、pytestは`pytest: command not found`、exit127・0件で**HOLD**です。補助表示fixture v1は1件で停止（受理0・9NOTRUN）を保持。v2は記録10/10・actual0ですが、旗/距離の交絡で静止同条件pair0/5、320では場所名末尾の省略が残ります。

運営者の1行/距離優先（現行2525行、旧2521）を維持し、open時の全文折返しは運営者判断として保留します。傾きセンサー・本物の指・実回線の速度・人の理解と離脱率は未確認です。通常primaryの初touch送信→DOM反応約0.129秒もphysical paintや実感ではありません。試験対象HEAD69c0891a/base71bd05c9は後続main6334d310とは別です。[詳報・自然原画像34枚＋補助11枚・固定出典/試験ログ](https://github.com/shota0617/ricepia-judge/blob/codex/firstminute-round145/docs/first-minute/round-145/README.md)。
