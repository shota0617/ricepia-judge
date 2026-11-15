# R146・5サイズ初期表示の修正前基準

原case JSON10件を静的に照合し、原PNG10 files（全てunique）をoriginal表示で全実見した。原byte/寸法/SHAは各photo記録と一致。ブラウザ・テスト・製品編集の追加実行0。比較用の全文・font・rect・文字Range・hitをbaseline.json、独立幾何再計数をgeometry-check.jsonへ保存した。

| viewport | 通常の矢印→札文字Range交差 | reduceの矢印→札文字Range交差 | 原画像での確認 |
|---|---:|---:|---|
|320×568|0|0|reduceの矢印は題名両端に近い。題名は読める|
|390×844|0|0|矢印は中央の絵の左右、札・日付・題名は読める|
|568×320|0|6|reduceで左札冒頭／右札末尾と絵に丸矢印が重なる|
|844×390|0|6|同じreduceの札重なり。背景の天気差は自然状態として保持|
|820×1180|0|0|矢印は絵の左右。カード・文字・上部操作域が画面内|

交差6は左「畦から」／右「かない」の文字Range矩形と矢印boxが交差する数で、6文字すべて判読不能という意味ではない。320 reduceでは題名「元」「ぼ」の端が各0.890625px幅×28.609375px高さだけ矢印の外接矩形へ入る。丸背景の透明な角や字のbearingを矩形では表せず、原PNGで題名が不透明に覆われたとは確定しない。日付・田の状態語へ矢印の文字Range交差はない。

札19px、日付48px、題名22pxは全10件で同じ。田の状態語は320幅13px、390/820縦17px、568/844横12px。カード・左右札・日付・題名・田の状態語・home/soundは採取時に画面内。字のRangeが自身の行boxを越えることと実clippingを混同せず、祖先overflowと原画像を別に照合した。home/soundは両snapshotで中心hitを所有するが、実押下0なので押せることの実証ではない。日付/田の状態語のcenterOwned=falseは既存pointer-events:noneによる通過と区別し、入力不良に数えない。

補助の再計数では、reduceの指の外接矩形も縦3サイズで日付2文字、横2サイズで題名2文字のRangeに触れる。指画像の透明余白と文字のascender/line-heightの範囲を含む幾何記録で、原PNGからその2文字が不透明に隠れたとは判定していない。今回の矢印修正候補へ混ぜず、同じ手順によるafter比較用の既存値として残す。

normal/reduceの主要10要素を写真前後で比べた100比較ではrect差0/font差0。initial時点には35のrect差があるため、入場アニメーションを含む別時点を同一frameとして扱わない。30snapshotを通じ、対象の可視文字Rangeにviewport/記録されたoverflow祖先による欠けはなく、home/sound60観測は画面内・中心hit所有だった。ただしこれも実押下やすべてのframeの可読性を保証しない。

UIready後の無入力wait実値は9.999290～10.001260秒。case05/08の10秒未満1ms以内の実測も残した。初期・写真前後の1月1日／題名／札本文／choices空は全件一致し、入力API0/trusted0、非trusted bStart click各1。起源はstack未記録なので原イベント以上には断定しない。実3D/音contextのactiveを初期状態へ強制せず、操作前の状態として保存した。

写真の要求・完了と前後の診断は別時点。normalの指・札アニメーションとreduceを同frame/同seedで比較したものではない。今回の通常568×320原1枚および採取3時点で、指による題名遮蔽を新規確定していない。これは既存107 suiteのFinger3D title失敗を解消した意味ではなく、別の状態・時刻の証拠として保持する。理由/回答feedback/入力後3D/全animation位相は本無入力観察の対象外。

source7/env8/HTTP5はbatch前後一致、10context閉鎖/CPU reset、browser閉鎖とroot live0を確認した。rootのGit statusには未追跡の新規回帰test `tests/test_kome365_reduce_cue.py` が記録されており、worktree全体cleanとは書かない。actual1はfavicon.ico console404が1件、他記録エラー0。観測10件取得とcleanExecution=falseを分ける。

これはbeforeのみの基準。通常primary、reduce pilot1回、同画面入力再現10回、既存/新規の試験は別母数。改善・全画面合格・実機効果・離脱改善の実測を主張しない。
