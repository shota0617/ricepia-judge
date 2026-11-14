# 米づくり365：844×390での最初の1分

**短い斜め入力を速度別に固定10回確認し、日付が進まない症状は0/10。製品・テスト変更0。** 20機会のうち10操作を送り、10/10でカード変形・翌日・新しい理由を記録、送信後の無反応は0。手本の向き未確定による10機会は未送信で、無反応に数えない。○7・✗3で1月11日へ進んだ。離脱率は測っていない。

対象は `3cde897ae205ad95b6a54b89ea1d08f1d2d2b584` の `/kome365/index.html`。リポジトリ最上位の `python3 -m http.server 8000` からローカルChromiumで開き、844×390、CPU1、isMobile/hasTouch、新context、CDP `Input.dispatchTouchEvent` で1回遊んだ。10秒無操作→写真保存→60秒の入力時計。手元の資産を使い、製品・テストは変更していない。

現在の明瞭な手本1回と同カードの手本履歴9回に従い、全10入力は左へ100pxの通常スワイプ。要求120msに対し実送信120.2–140.6ms。カード幅360px、10軌跡は各入力前のカード矩形内だった。これは短斜め60×50pxの再現結果ではなく、正解選択の比較実験でもない。

| プレイ時計 | 記録されたこと |
|---|---|
| 0.252秒 → 0.9088秒 | 初入力 → drag DOM（差656.8ms） |
| 0.9181秒 | 初カード変形のDOM記録（初入力から666.1ms） |
| 1.8137秒 | 翌日と最初の○・理由（初入力から1.5617秒） |
| 52.923秒 → 53.043秒 | 最後の入力開始 → 指を離す送信 |
| 60秒まで | 10回の日付・理由進行、1月11日へ |

80CDP命令全ACK、trusted pointer32件（down10/move12/up10）。32イベントのevent timestamp→受動listenerは605.4–1045.6ms。送信間隔・ACK・event時刻・handler受信時刻を分け、配送待ちを指の動きの長さや製品だけの遅延にしない。DOM観測は物理paintや人の満足の時刻ではない。

原写真は今回の1回からの無加工PNGで、変更前後比較ではない。

| 原写真 | 要求 → 保存完了（各時計の秒） | 原画の表示 |
|---|---|---|
| [観察10秒](observe-10s.png) | 観察10.001 → 16.984 | 1月1日、左右札、手本 |
| [play10秒](play-10s.png) | play10.000 → 11.056 | 1月3日、左右札 |
| [play30秒](play-30s.png) | play30.000 → 31.260 | 文字のない半透明のカード形 |
| [play60秒](play-60s.png) | play60.000 → 61.217 | 1月11日、左右札、手本 |

観察写真保存に6.9833秒、撮影後確認に130.9msかかり、play開始は観察開始17.1152秒後。この待ちは製品応答へ足さない。30秒写真の近傍はNode play時計でfly30.1988秒→1月7日enter/○理由30.7842秒→cardVisible=true31.5772秒、idle=false。持続する空白や運営の30秒カードと断定せず、撮影1.260秒を空白の持続時間に使わない。原4枚に○✗の理由が写ったとはしていない。

田の語は4枚とも「田おこし まえ」。絵の小さな明るい印は見えるが、累積や○との対応を人が理解したかは未測定。同じ語から絵が全く変わらないとは言えない。既存の土の印の見分けやすさは設計仮説として残し、説明・待ち日数・箱・点列は足さない。[index.html:441](https://github.com/shota0617/ricepia-judge/blob/3cde897ae205ad95b6a54b89ea1d08f1d2d2b584/kome365/index.html#L441)の運営決定、理由の位置/2秒、0.3秒手本、速いスワイプ、タップ非選択、影、30秒カード、音、かかし・太陽を維持する。画面文言は[既存cards.js:584](https://github.com/shota0617/ricepia-judge/blob/3cde897ae205ad95b6a54b89ea1d08f1d2d2b584/kome365/cards.js#L584)などのUI引用で、新しい農業の事実は加えていない。

通常プレイは実child/outer exit1。console404×2と、別ResourceTimingでfavicon404×2を記録（request-id結合なし）。入力・driver例外0、保護3を含む設定対象5ファイルの前後/配信SHA一致、CPU復帰・browser閉鎖を確認した。音と3Dの終了後debugは状態記録で、聴取や実機性能の証拠ではない。

`pytest tests/`は実exit127、原文 `/bin/bash: line 1: pytest: command not found`。suiteは実行できなかった。他のゲーム/周の検証は今回へ足していない。

通常プレイで未観測だった短い斜め入力を、別の固定診断で確認した。各回は新browser/context、同じ初カードを10秒無操作で観察し、中央から(-60,+50)pxへ3移動、要求60/160msを交互に各5回。途中のACK待ちを入れず、実event時刻・coalesced3点・同じtrusted指・hit・軌跡を照合した。成立条件は実effective event時間0以上300ms未満などで、製品のquick判定結果を条件に入れて失敗を除外していない。指を離す実送信+2200msを目標に読取り、期待する1月2日への進行を数えた。入力条件の場所は[index.html:4034](https://github.com/shota0617/ricepia-judge/blob/3cde897ae205ad95b6a54b89ea1d08f1d2d2b584/kome365/index.html#L4034)・[quick条件:4055](https://github.com/shota0617/ricepia-judge/blob/3cde897ae205ad95b6a54b89ea1d08f1d2d2b584/kome365/index.html#L4055)。

固定10回はすべて成立し、60ms側5/5・160ms側5/5で日付が進んだ。非進行0/10、無効0、差し替え/再試行0。実effective event時間は59.0–66.0ms／159.9–161.0msで、listener受信幅5.3–318.2msとは別。先行pilot2回の成立/進行2/2は固定10へ足さない。local source7の前後・HTTP5の入力前・選択依存8の前後と閉鎖を確認したが、console404は12回計24件残る。診断child/outer実0は系列完了を示すだけで、全検査合格やエラーなしの意味ではない。外部報告の9/10と今回0/10を製品修正の前後・改善効果として比較しない。

代表の[60ms診断後](diagnostic-fast-after.png)／[160ms診断後](diagnostic-slow-after.png)は未変更の製品への入力後で、修正後写真ではない。半透明の理由帯と次の手本が同じ範囲にあり、読む対象の競合は「運営者の判断」に回す候補。両方の一部は読め、全文不可読・完全遮蔽・押下不能・発生頻度・持続時間・離脱への影響は未確認。理由の位置/2秒と手本を変更しない。fixed-02の読取りsnapshotはwhyVisible=false、その後の原PNGには理由帯が写る。別時刻の観測を同一視せず、ちらつきと断定しない。全24診断原PNGの識別子/SHAと各回の値はresultsに保存した。

対象症状が固定10回で再現せず、製品修正・追加回帰テストのRED/GREEN・変更前後比較・修正後5サイズ比較は実施していない。実指・センサー・回線・音・物理paint・人の理解と離脱率は未確認。前周との画面や待ち時間の差を改善効果にしない。

指定動画は未再生。[本人記事](https://www.famitsu.com/news/201705/17132636.html)と[英語第三者OCR](https://github.com/flossbud/sakurai-game-design/blob/main/episodes/transcripts/100-development-secrets-of-the-original-kirby.md)を、操作成立・小さい肯定・次の一手を分ける判断軸に使った。動画で不具合を発見したとはしていない。

原証拠識別子とSHAは[results.json](results.json)。scratch識別子は公開リンクではない。検証対象は上記sourceで、資料追加後HEAD全体の検証とは区別する。
