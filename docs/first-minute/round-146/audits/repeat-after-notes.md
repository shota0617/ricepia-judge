# R146 reduce 矢印：修正後10回と修正前の比較

原case10 JSONをtrace/sends/Rangeから再計数し、原PNG10 filesの844×390・byte/SHAを照合した。2 unique原画像（case01/03）をoriginalで全内容実見し、同byteの残りへ対応付けた。全10を別々にviewしたとは書かない。矢印は残ったまま日付の左右へ上がり、左右札への重なりがなくなっている。今回2画像で日付・題名への新たな可視遮蔽も見えない。

| 独立計数 | 修正前 | 修正後 |
|---|---:|---:|
|入力前の札と矢印が重なるcase|10/10|0/10|
|各snapshotの文字Range交差|6|0|
|両矢印が見えるcase|10/10|10/10|
|1回の指送り後、8秒以内に1月2日へ進むcase|10/10|10/10|
|送信／ACK|80／80|80／80|
|favicon console404／actual exit|11／1|11／1|

矢印rectは両側ともyだけ107px上がり、width70/height54、記号・font・pointer-events:noneを保持。カード、左右札本文、日付、題名、home/soundの7要素を各case写真前後で比べ、rect/font/全文/文字Range差0。矢印→日付/題名Range交差も修正後0。背景の天気・seed・全trajectoryを同一にした比較ではなく、case順と指定速度、最初のカード本文を合わせた比較である。

修正後は120/600ms各5、trusted native down/up各10、move57（各回4～6）、cancel0、同ownerで左100px・縦0。入力前trusted0、bStart synthetic各1は原記録で残し起源未確定。release前の日付更新0、実日付更新はnative up event後39.6～111.8ms、handler capture後の値もJSONへ分離した。Node送信holdとnative event holdは次のとおり。

| 指定 | Node実送信hold | native event hold |
|---|---:|---:|
|120ms×5|119.063～120.512ms|117.7～120.1ms|
|600ms×5|599.944～600.690ms|600.0～600.8ms|

初期wait実値は9.999390～10.002527秒。終端は全件native up+8秒より282.5～473.1ms後まで記録されるが、途中の最大状態gapは5.611～6.025秒あり、修正前の5.528～5.769秒と同様に連続coverageとは呼べない。全日付更新は最大gap前のmutationで記録した。処理gapの変動を改善・悪化の因果効果として扱わず、実機性能へ外挿しない。

指送信epoch対応の近似ではdrag5.5～12.0ms、transform37.9～104.7ms。DOM採取のproxyであり実画面提示時刻ではない。初期重なりは指送信前に記録済みなので、後続の指速度をその原因にしない。

同じfrozen runner/case/diagnose/before-bindingを保持して実行し、after bindingはHTML `0186cfdb…`、他6 source/environment8は同一。source7/env8/HTTP5は全case/batch両端で一致、CPU reset/context10閉鎖、browser閉鎖/root live0を原記録で確認。root statusのHTML変更と未追跡新testを残しcleanWTとはしない。全10入力後に実Three128/Field3D active、音ON/context runningを記録したが、実出音を聴いた証拠ではない。

actual1はfavicon console404×11（case01が2、残り各1）、他記録エラー0。UNKNOWN/NOTRUN/取り直し0。1browser内のfresh context10回を10人や10 cold browserと呼ばない。修正前監査はSHA不変で保持し、通常primary、pilot、5サイズlayout、回帰/既存試験と母数を混ぜない。この結果は当該初期札の重なり解消と入力維持の観測証拠であり、離脱改善実測や全面的合格を意味しない。
