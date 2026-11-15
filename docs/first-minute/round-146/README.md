# R146：静止した丸矢印を、選ぶ文から離す

製品HTML `0186cfdb…`、コード＋新test commit `c3598c76b03b37aeab47d9b260cea952fa00fdb1` の検証記録。全実行と独立監査は固定済み。既存テスト1件の失敗とpytest未導入により、マージ・公開を保留する。PRの現在状態はPR画面を参照。

844×390の「動きを減らす」設定で、初期の丸い◀▶が左「畦から」・右「かない」の文字Rangeへ重なる。入力前の交差は旧10/10→新0/10、両矢印の可視と1月1日→2日の日送りは旧新10/10。6は矩形交差した文字Range数であり、6文字全部が判読不能という計数ではない。

変更は `kome365/index.html:799` のCSS1行だけ。reduce・高さ440px以下・幅564px以上で `#swGuide .gd{top:33px}` を追加し、既存margin-top:-27pxにより円上端をカード上端+6pxへ移す。円70×54px・字40px・色・左右6px・停止指・表示条件・カード/札の文字とサイズ・入力は保持する。通常motionや対象外の画面条件には適用しない。旧HTML `1131aca2…` と候補を同じcontrollerで比較した。

[旧：repeat case01](images/repeat-before-case01.png) / [新：repeat case01](images/repeat-after-case01.png)

|独立した記録|確定した値|限界・終了状態|
|---|---|---|
|通常primary844×390：観察10秒＋play約60秒|送信8、未送信の手本待ち13、日送り8/8|actual1/favicon404×2。reduce候補の改善母数ではない|
|reducepilot1|原1枚で重なり確認、Range6、command/trusted0|actual1/favicon404×1。10回へ合算しない|
|旧新reduce反復各10|入力前交差10/10→0/10、日送り/矢印可視10/10→10/10|両版actual1/favicon404各11。自然乱数全軌跡や人の理解を比較していない|
|旧新5サイズ×通常/reduce・各10context|横reduce2条件の札Range6→0、他8条件の矢印rect不変|両版actual1/favicon404各1。既存接触と位相差は下記のとおり残る|
|追加回帰v2・同じ1test|旧actual1・line178で6文字交差→新actual0|実HTML/CSSの初期normal/reduce検査。自然10回とは別|
|長日付補助fixture・新側だけ|4,464行全再計算/欠測0/矢印と日付・指定8対象との交差0、最小gap1.078125px、15原PNG実見|actual1/favicon404×1/preload warning6。非実在日付を含むDOM字幅検査|
|既存107・前後同じsuite|両版106pass/1fail、actual1|同じFinger3D・f568×320題名best値73。既存assertは不変|
|pytest tests/|before/afterともexit127、実行0件|`pytest: command not found`。全体合格ではない|

## 入力と時系列

反復は1browser/10freshcontexts、左100px・6move、120/600ms交互各5。旧新80command/80ACK、trusted down/up各10、cancel0、日付のrelease前更新0。native event holdは旧fast119.7–122.1ms/slow599.7–610.4ms、新fast117.7–120.1ms/slow600.0–600.8ms。handlerの処理遅延を指の速度へ置換しない。初期交差は入力前なので、後の速度差を原因にしない。最大状態記録gapは旧5.528–5.769秒/新5.611–6.025秒で、連続8秒監視や性能改善は主張しない。入力後の実THREE128/Field3Dと音ON/context稼働は各10で確認したが、実音聴取ではない。非trusted bStart click各1は起源未確定のまま保存した。

repeat原10PNGの独立実見は旧3unique(case01/05/07)、新2unique(case01/03)で、残りは同byte対応。全20を個別実見したという記録ではない。[旧監査](audits/repeat-before-notes.md) / [新・比較監査](audits/repeat-after-notes.md)。原全20PNG/caseJSONはnatural archiveに保持する。

通常primary原写真：[観察10秒](images/primary-observe-10s.png) / [play10秒](images/primary-play-10s.png) / [play30秒](images/primary-play-30s.png) / [play60秒](images/primary-play-60s.png)。初touch送信→dragクラス約0.034秒、最初のtransform約0.061秒はepoch対応したDOM proxy。最初の肯定○mark可視はplay19.7807秒、初入力から約19.5325秒、○を生んだ3操作目から約1.2955秒。初入力からの値は先行回答と待ちを含む。最大longtask5.282秒/heartbeat gap6.3463秒はローカルSwiftShaderの1runであり、原因を3Dと断定しない。[精密時系列](audits/primary-timing-audit.md)が旧監査の曖昧な時計表現を補足する。DOM/rAFはphysical paint・人の反応実感ではない。

## 5サイズの前後原写真

各相5サイズ×2motion、UI ready後約10秒の無入力観察。自然play60秒でも10反復の追加試行でもない。

|画面|通常motion|reduce|
|---|---|---|
|320×568|[旧](images/layout-before-case01.png) / [新](images/layout-after-case01.png)|[旧](images/layout-before-case02.png) / [新](images/layout-after-case02.png)|
|390×844|[旧](images/layout-before-case03.png) / [新](images/layout-after-case03.png)|[旧](images/layout-before-case04.png) / [新](images/layout-after-case04.png)|
|568×320|[旧](images/layout-before-case05.png) / [新](images/layout-after-case05.png)|[旧](images/layout-before-case06.png) / [新](images/layout-after-case06.png)|
|844×390|[旧](images/layout-before-case07.png) / [新](images/layout-after-case07.png)|[旧](images/layout-before-case08.png) / [新](images/layout-after-case08.png)|
|820×1180|[旧](images/layout-before-case09.png) / [新](images/layout-after-case09.png)|[旧](images/layout-before-case10.png) / [新](images/layout-after-case10.png)|

横reduce2サイズでは矢印のyだけ−107px、幅70/高さ54を保持。写真前後の日付・題名・左右札・カード・home/soundのrect/fontは同じ。通常390/844の田の状態語は雨の自然差があるため全文同seed比較ではない。home/soundは各相60/60の画面内/中心hit観測、実押下0。

320reduce題名両端の0.890625pxの既存Range接触、reduceの指接触は不変。通常の写真後snapshotでは指接触がcase03で0→2、case09で2→0となる約0.867pxの位相差を残し、「全個別時点で交差増0」とはしない。20原PNG(18unique)の独立実見では、新たな不透明な文字隠れは確認されなかった。透明な角を含む矩形交差は不透明遮蔽の証明ではない。[前後監査](audits/layout-after-notes.md)。既存Finger3D試験の別条件の失敗を解消した証拠にも使わない。

## 長日付の補助検査

844×390・568×320・564×440、normal/gold/fest/goldfestの各372文字列(12ヶ月×31日)を、実fonts.ready後に日付textContentとカードクラスだけ一時変更して検査した。2月31日等も含む字幅ストレスで、ゲーム内日付・保存・時計は差し替えていない。12rows全4,464行から日付44,280組/他対象258,912組を再計算し、不一致0。最小余裕1.078125px、日付最大幅205.828125px。表測定12＋撮影12の復元24/24、保存キー/値集合3/3一致、trusted入力0、内部nontrusted bStart計3を保持した。

各372状態は同じevaluate内の同期レイアウト読取。4,464paintや自然な特別カード到達の証拠ではなく、15原写真だけを実見した。題名・選択肢・田の状態語は初期のままで、全季節の長文/pd4二行状態/別フォント/文字拡大の保証にはしない。無入力なので3D稼働・実音聴取も証明しない。[独立監査](audits/long-date-audit.md)、[15原写真一覧](images.json)、[archive](evidence/long-date-raw.tar.gz)。

共有closureのprepared8/bindingはrepeat用で、fixtureの束縛証拠へ流用しない。固有prepared7/binding72c78a32…/frozen38ee2ef5…/parse3を同梱し、共有source7/env8/HTTP5/serverと実行直後の歴史的live0の範囲を[原closure補足](longfixture-root-closure-clarification.json)に残す。

## 試験の扱い

実行コマンドは `python3 tests/test_kome365_reduce_cue.py -v`、`python3 tests/test_kome365_firstmin.py -v`、`pytest tests/`。ローカルPlaywright/Chromiumへの環境変数は各 `execution.json` に保存した。自然観察の配信にはリポジトリ直下の `python3 -m http.server 8000` を使用した。

新test v1のoffset座標系誤り9!=21は狙った旧REDに数えない。[原失敗ログ](tests/regression-before/stderr.log)を残した。v2は同じカード座標へ換算し、幅/高さ厳密一致、left/topだけCSSOM丸め1px以内とした新規test案。交差判定に許容を流用せず、矢印可視/70×54/字40を先に確認し、最後の実文字Range交差assertで[旧RED](tests/regression-before-v2/stderr.log)→[新GREEN](tests/regression-after/stderr.log)を確認した。既存107のassertは変更していない。既知favicon404は原ログへ保持する仕様で、GREENはconsole0ではない。

[既存before](tests/existing-before/stderr.log) / [after](tests/existing-after/stderr.log)は各107件、106pass/同じ1fail、actual1。保存ログの107終端を[別再集計](tests/existing-count-audit.json)した。afterは999.906秒、rootのsource/test不変・閉鎖/live0記録も添付する。題名best値73は73文字という意味ではなく、変更前からの同じ失敗を候補の回帰と断定しない。[pytest before](tests/pytest-before.stderr.log) / [after](tests/pytest-after/stderr.log)はコマンド不在で127、0件。全試験合格に置換せずHOLD。

[正式静的レビュー](audits/code-review/notes.md)はP0–P3指摘0。通常のmark待ちとwhy第一候補の12px離隔を静的に確認した一方、理由の代替位置・2短tap後・初3枚の速い連続操作は今回未測定で、欠陥数へ加算しない。原レビュー内のafter未完了という記述は読取時点の履歴であり、最終結果は上のbefore/afterログを参照する。テストはcommit前HEAD `6334d310…` 上の候補byteで実施し、その同じ製品・新test byteを後にcommitした。[rootのcommit記録](code-commit.json)で変更2ファイルとworking/committed SHA一致を確認できる。

## 再現・資料・運営者決定

844×390のfresh contextでreduceを有効にし、ローカル実HTML/assets、音ON、CPU1、外部通信遮断、実時計/描画のままページの初期診断後約10秒待つ。入力前に丸矢印と左右文のRangeを採る。その後左100px/6moveを120msまたは600msで1回送信し、1月2日への進行を別計数する。旧新で同じ10順序・座標・計測を用い、試行の取り直しや状態/seed注入をしない。使用run/helpers・source/environment・closure・全caseはnatural archive内にある。archive展開だけで再起動する手順ではなく、当時の実行束縛を保存したもの。

方法の成績（ricepia-flow:224）：設定差の比較＋文字Range＋原PNGで確定1件。他の未再現候補は確定0/未確認として区別し、次周の初期探索へこの方法を引き継ぐ。

「運営者の判断」に回した新たな変更案は今回はない。運営者決定の0.3秒手本・素早いswipe受理・tapで選ばない/動かさない・初端影・○✗理由2秒/最初3枚の持越し・日付と選ぶ所を避ける・30秒カード・音ON/OFFと音で時間を変えない・太陽/かかしを維持する。engine/field3d/cardsは旧新SHA一致。静止方向案内を縮小/非表示にしない。通常の未保護の配置改善として1行を提案し、保護仕様の変更を判断待ちに混ぜない。外側49px案/専用62px段案は別履歴の不採用案で、採用結果へ数えない。

資料は[GMTK89 The Power of Video Game HUDs](https://www.youtube.com/watch?v=4Bv45aPMGyI)、提供908–913行/章SHA `6ca6bbad…`。読みやすさ/理解を犠牲にしない原則を、案内を残しつつ札を隠さない配置へ対応づけた。動画がreduce/top33pxを指定したとはしない。新全文読了・原動画視聴0、全239実装を主張しない。傾きセンサー・本物の指・実回線の速度・人の理解と離脱率は未確認、現実の離脱改善実測0。

[証拠構成と展開手順](evidence-plan.md) / [測定値と作成時点の状態](results.json) / [原byte対応](provenance.json)。取得記録はnatural45＋long15=60PNG。直接リンク用41PNGは同じ原画像の書き出し数で、archive内のコピーを含め再計測へ二重加算しない。既存準備版と原記録は不変、R145/他PRを含めない。
