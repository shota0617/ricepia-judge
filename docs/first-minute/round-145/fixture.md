# 補助表示fixture：自然試行とは別の記録

v1 run-01は旧320×568のcase01だけを記録して停止した。actual child/outer exit1（635daa）、受理観測0/予定10、残り9はNOTRUN、旧新pair0。入力command0・trusted0だがnon-trusted click2を記録した。発火コードの起源はこの固定監査では未確定で、v2の分類を遡及しない。元guide参照とstateは復元、閉鎖/root live0。失敗記録と原1枚を残す。[原report](evidence/fixture-run01-report.json)・[実exit](evidence/fixture-run01-execution.json)・[独立監査](evidence/fixture-run01-notes.md)・[原PNG](images/fixture-v1-case-01-old.png)。

v2 run-01は10caseを完了し、対象fixture記録10、unknown0、NOTRUN0、外側actual0（d9f5a7）、子10/10 exit0。前後gate20/20、context/browser10/10閉鎖、root live0。これは明示guide注入を使う表示fixtureであり、自然到達10件や可読性全面合格10件ではない。原10PNGは独立監査担当がすべて実見した。[原report](evidence/fixture-v2-report.json)・[実exit/閉鎖](evidence/fixture-v2-execution.json)・[独立監査](evidence/fixture-v2-notes.md)。

|サイズ|旧の写真前→後距離|新の写真前→後距離|画像・比較の留保|
|---|---|---|---|
|320×568|915m→915m|408m→2.0km|新のみ旗あり。新は場所名先頭が見えるが、内部括弧末尾まで全文可読ではない。|
|390×844|408m→2.0km|915m→915m|旧のみ旗あり。新でも人物名後半は省略される。|
|568×320|915m→915m|408m→2.0km|新のみ旗あり。原写真では全文1行、距離条件は異なる。|
|844×390|408m→2.0km|915m→915m|旧のみ旗あり。原写真では全文1行、距離条件は異なる。|
|820×1180|408m→2.0km|408m→2.0km|対応診断の幾何/距離は一致するが、両caseとも撮影中に距離が変わる。|

**厳密な静止同条件pairは0/5。** 新5枚すべてで場所の先頭は見えるが、全5サイズで場所名全文が読めるとはしない。4組は旗を含むDOM名が28/30字で異なる。人物・場所の本文28字の文字集合は同じ。6case（02/03/06/07/09/10）は距離幅36.015625→42.015625px、名前幅6px減少が記録されたため、全5サイズのgeometry不変を主張しない。全20診断で名前13px/19.5pxの1行。傾き案内＋下部5タブの6button×20診断＝120観測で画面外0・中心hit失敗0。実タップ120回や全操作域の保証ではない。新しい遮蔽/切れは原写真の範囲で未確認であり、全時刻の保証ではない。

入力command0・trusted0・unexpected0、DOM eventは20。各case2件のnon-trusted clickはmeiroBtn→demoBtnで、raw target・製品stack・DCL前後時刻等を独立再照合し、固定されたbootstrap署名に20件とも一致した。全event0とは書かない。旧route応答45f4ba7b…と新応答8267f441…を分け、実応答meiro SHAも確認された。

元guide参照は10/10復元。全state snapshotが同じなのはcase05/06の2件だけで、01/04/08はguides/glowGoal、02/03/07/09/10はidle.lastの差分が残る。全state復元とはせず、差分の原因を表示順変更へ帰属しない。距離は実renderの値で、castle-guideへの自然移動距離ではない。

自然repeatの対象6/10・unknown4/10、自然layout旧3対象/新1対象の母数は変更しない。自然原34枚と補助11枚は[45枚の一覧](images.md)で分ける。実時間/seed/frameは一致せず、傾きセンサー・本物の指・実回線の速度・人の理解と離脱率は未確認。
