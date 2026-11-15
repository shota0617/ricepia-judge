# R146 reduce 矢印：修正前10回の独立監査

case10 JSONを原trace/sends/Rangeから再計数し、原PNG10 filesのbyte・844×390・記録SHAを照合した。画像は3 unique原画像をoriginal表示で全内容実見し、同byteの残りへ対応付けた。全10を別々に実見したとは書かない。代表はcase01/05/07。背景/田の状態には差があり、case05は雨。3種とも丸矢印が左札冒頭と右札末尾・絵へ重なっている。

10/10で、入力前の写真前後とも左「畦から」／右「かない」の計6文字Range矩形と矢印boxが交差。両矢印と札の可視proxy成立、本文・配置は写真前後で一致。これは6文字が全文読めないという計数ではない。重なりは指送信より前に保存されており、後続120/600msの指速度を原因にしない。

1 browserで10 fresh contexts、120ms/600ms交互各5。80 CDP commandsは80 ACK、trusted native pointerdown/up各10、move56（各回4～6）、cancel0、同ownerで左100px・縦0。pointerとtouchの両イベント系列を別々の操作として二重計数しない。入力前trusted0、非trusted bStart click各1を原記録で保持し、stackがないため起源確定にはしない。

| 指定 | 回数 | Node実送信hold | native event hold |
|---|---:|---:|---:|
|120ms|5|119.956～122.190ms|119.7～122.1ms|
|600ms|5|599.565～602.828ms|599.7～610.4ms|

全10で1月1日→1月2日が原mutationに記録され、pointerup eventTimeStamp後38.5～119.4ms、up capture後36.7～107.6ms。release前の日付更新0。指送信epoch対応の近似では最初drag5.9～12.7ms、最初transform45.2～106.0msだが、これはDOM採取であり実画面表示・実指遅延ではない。原位置と全数値をaudit.jsonの各caseへ保存した。

終端状態は全件native up+8秒より277.7～487.3ms後まで残る。しかし状態採取の最大gapは各5.528～5.769秒あり、連続した8秒観測とは呼べない。全件の日送りはこの長い空白より前に直接記録されたため、今回の受理証拠はある。droppedカウンタ0は空白がない意味ではない。このrunnerではlongtaskの原因を測っていない。

初期wait実値は9.999882～10.000866秒。case10はsetTimeoutの実測が指定10秒より0.118ms短く、その値を保存した。PNGは取得開始/終了と診断前後の別時点であり、同一フレームではない。

source7/env8/HTTP5をbatchと全case両端の原値から再照合、context10閉鎖・CPU reset10、batch browser閉鎖とroot live0を確認。入力前はloader1/Three未開始、入力後は全10で実Three128/Field3D active・アプリ音ON/context running。実出音を聴いた証拠ではない。SwiftShader条件、1browserの共有状態、自然seed差を保持し、10独立利用者や実機速度へ一般化しない。

actual1、favicon.ico console404が11（case01が2、残り各1）。他のerror/pageerror/requestfailure/httpErrors/blockedは0。404を除去して全合格とはしていない。未知・NOTRUN・やり直し0。これは修正前の初期重なり10/10と入力維持10/10を分けた監査であり、修正後0件や改善実装・離脱改善はまだ主張しない。通常primary・pilot1回・既存107件の結果は別母数。
