# 米づくり365：最初の回答後に次の手本まで待つ

**初回答後の長い処理待ちを固定10回すべてで再現した。初日送りから次の明確な手本まで7.7228–10.0954秒。製品・テスト変更0、修正後は未測定。** 最初の1分で操作を続けにくくする候補1件として報告し、保護された3D実装に関わる処理分割は「運営者の判断」へ回した。人の離脱率や改善効果は測っていない。

測定source `aaf5400feb9a8849567a8d81fcc4ac88b06990db`、390×844・CPU1・新しいChromium/context・isMobile/hasTouch、CDP `Input.dispatchTouchEvent`。最上位の `python3 -m http.server 8000` から `/kome365/index.html` を開き、外部要求を遮断、手元のthree r128を使った。10秒無操作→写真保存→60秒の通常プレイ1回で、現在または同じカードで得た手本の向きに従った。

通常プレイは19機会のうち9送信・10未送信。9入力すべてdrag/transform/翌日進行を記録し、送信済み無反応0。理由onクラス＋文字は9回、文字変更8回（4手目は直前と同文）。○6/✗3、1月1日→10日。右1回の後に左8回で、左右を揃えた比較実験ではない。手本は現在の標本6・同カードの履歴3から選んだ。

| 通常プレイ時計 | 記録されたこと |
|---|---|
| 0.251秒 → 0.3126/0.3464秒 | 初入力→drag61.6ms/transform95.4ms |
| 0.7778/0.7821秒 | 翌日進行/✗の理由on＋文字（初入力から526.8/531.1ms） |
| 2.6553秒から6928ms | longtask。約6947.9msのRAF間隔、status読取往復6945.4msと重なる |
| 9.5911 → 10.6059秒 | 次のguideクラスtrue→同カードの明確な左右方向を初観測 |
| 17.8418秒 | 3手目で最初の○理由on＋文字。初入力から17.5908秒、その入力から880.8ms |

初回答は待ちの前に返っている。待ち中に追加の指は送っておらず「指を無視した」回数にはしない。Node heartbeat最大間隔272.8msとブラウザ側の待ちは区別する。未送信10回は方向x=0/軌跡opacity0で台本が向きを確定できなかった瞬間で、全10回に後続の同カードの明確な手本がある。永久消失や10無反応入力とは数えない。通常72CDP命令全ACK、trusted pointer31（down9/move13/up9）。

固定再現の手順は、毎回新しいbrowser/profileで同じ画面を10秒観察し、初カードの手本に1本指100pxを1回だけ送る。予定120/600msを交互に各5回、実event幅は120.9–122.1/599.1–601.0ms。予定touchEnd後15秒の固定窓で、初日送り後に始まる1秒以上のlongtaskを数えた。結果による除外・やり直しはなく、全10回で1月2日へ進んだ。

| 固定10回の指標 | 修正前 | 修正後 |
|---|---|---|
| 回答後1秒以上のlongtask | 10/10（各速度5/5、計17task） | 未測定 |
| 各回の最長longtask | 4.968–6.871秒 | 未測定 |
| 日送り→guideクラス | 6.7644–9.0316秒 | 未測定 |
| 日送り→明確な次の方向cue | 7.7228–10.0954秒 | 未測定 |

固定系列のparent実exit0は10枠完了・閉鎖確認で、全検査合格ではない。各childはconsole404×2により実exit1、計20件を保持。診断写真20枚はscratchに保存し、公開した通常プレイ4枚とは別。whyクラス差6.768–9.039秒を可視時間にせず、未実施の修正後を0/10へ置き換えない。各trialの数・原証拠SHAは[results.json](results.json)。

原因を調べたCPU profileは別1回で固定10回へ加えない。1,289msのtaskに[初期化経路 index.html:2131](https://github.com/shota0617/ricepia-judge/blob/aaf5400feb9a8849567a8d81fcc4ac88b06990db/kome365/index.html#L2131)→[field3d.js:1416](https://github.com/shota0617/ricepia-judge/blob/aaf5400feb9a8849567a8d81fcc4ac88b06990db/kome365/field3d.js#L1416)、5,166msのtaskに[後続frame:1273](https://github.com/shota0617/ricepia-judge/blob/aaf5400feb9a8849567a8d81fcc4ac88b06990db/kome365/field3d.js#L1273)の標本がある。後者には帰属できない`(program)`の標本も多く、全時間をinit・GPU・shaderへ割り当てない。profile全体のinclusive標本重みはinit1,140.372ms/frame1,528.916msで、重複があり合算不可、厳密な関数時間ではない。時計の対応は開始幅83.7msのモデルで、原負delta計4µsも保持した。

開始予約を持つ[index.html:970](https://github.com/shota0617/ricepia-judge/blob/aaf5400feb9a8849567a8d81fcc4ac88b06990db/kome365/index.html#L970)・[回答時:3919](https://github.com/shota0617/ricepia-judge/blob/aaf5400feb9a8849567a8d81fcc4ac88b06990db/kome365/index.html#L3919)だけを変えても、重い処理が減る証拠はない。待ちを別の操作へ移すだけの変更は採らなかった。初期化・初期描画の分割は変更禁止の`field3d.js`に関わるため変更せず、運営者の判断として報告。重い環境で既存2D表示を維持する体験上の選択も未実装・効果未確認の候補として残す。保護3ファイル・理由2秒/位置回避/初3枚保持・手本・音は変更していない。

| 通常プレイの原写真（変更前後ではない） | 要求→保存完了 | 原画の表示 |
|---|---|---|
| [観察10秒](observe-10s.png) | 観察10.000→10.186秒 | 1月1日、左右選択肢。指は写らない |
| [play10秒](play-10s.png) | 10.001→10.535秒 | 1月2日、左右選択肢と手本 |
| [play30秒](play-30s.png) | 30.001→30.817秒 | 1月5日、左右選択肢と手本 |
| [play60秒](play-60s.png) | 60.002→60.894秒 | 1月10日、左右選択肢と手本 |

4PNGは無加工で日付/選択肢が読めるが、○✗/理由帯の瞬間は含まない。class/textや写真にないことから、連続した可視2秒・不表示・物理paintを断定しない。初回why on/off差8.8215秒も可読時間ではない。速い連続選択での初3枚保持、全サイズ/回転での日付・選択肢との非重複は未検証。初回写真保存185.4msを含む観察→play10.199秒を入力遅延へ足さない。カード名/「田おこし まえ」は[既存cards.js:584](https://github.com/shota0617/ricepia-judge/blob/aaf5400feb9a8849567a8d81fcc4ac88b06990db/kome365/cards.js#L584)などのUI引用で、新たな農作業の事実を加えていない。

通常プレイ実outer1（保存child要求値1）、console404×2。別ResourceTimingのfavicon404×2とはrequest IDで結合していない。profileも実parent0/child1、console404×2を保持し、採取/disableエラー0・閉鎖確認済み。`pytest tests/`は実exit127、`/bin/bash: line 1: pytest: command not found`でsuite未実行。修正を採択していないためRED/GREEN・修正後再現・5サイズ前後比較は未実施、既存テスト変更0。

提供された部分文字起こし（本文75節・未完了35節）の[反応](https://www.youtube.com/watch?v=EDs5n39sRFc)・[肯定](https://www.youtube.com/watch?v=1xRDwQqSn6I)・[自然な導入](https://www.youtube.com/watch?v=L1Su0aajYFA)・[近い目標](https://www.youtube.com/watch?v=rA_FN6BTGms)を評価基準とし、初応答・最初の○・次の手本・待ちを分けた。未完了部分は補わず、動画本体は未再生。Chromium/SwiftShader環境の結果で、実指・センサー・回線・実音・人の理解と離脱率は未確認。

測定は上記aafで完了。検査後に公開base `8e5d32bd263beddc4e39e9c15e1b03445b09d6a7` へ進めた差分はR117資料6ファイルのみ、指定source7は同byteだが資料追加後HEAD全体の再検査ではない。scratch識別子は公開リンクではなく、原証拠のSHA/場所はresultsに保持した。
