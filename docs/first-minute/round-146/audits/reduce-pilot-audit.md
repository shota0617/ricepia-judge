# R146 reduce 初期pilot 独立照合

原PNG1枚をoriginalで実見。左の丸い◀が「畦から田見る」の冒頭、右の▶が「田へ行かない」の末尾と絵に重なっている。写真前後とも左右の矢印boxが同じ6文字（左「畦から」、右「かない」）のRange矩形と交差する。6文字が全文読めないという計数ではない。矢印はpointer-events:noneで、hit-testだけでは描画の重なりを判定できない。

正規reduce・844×390、10,000.894ms無入力後の原写真。写真取得107.667ms、診断before/afterと同一フレームではないが、日付・題名・札全文・矢印box/交差6が両端で一致。inputCommands0/trusted0。非trustedのbStart click1は保存され、由来はstack未記録のため断定しない。初期3Dはloader1/Threeなし、音ONだがcontext未開始で、自然な入力前状態として保持する。

source7/env8/HTTP5両端、context/browser閉鎖・CPU resetは記録上成立。favicon.ico由来console404が1件ありactual1、画像/診断の観測成立とcleanExecution falseを分ける。primary通常設定とは別条件の1観察であり、10回再現・改修済み・実機改善・離脱改善ではない。

次の10回はfresh reduce同画面、まず入力前の同じ写真/Rangeを保存し、それからleft100px/6moveを120/600ms各5で1回だけ送り受理と日送りを別集計する。初期重なりは指送信前に発生しているため、後続の指速度を原因にしない。
