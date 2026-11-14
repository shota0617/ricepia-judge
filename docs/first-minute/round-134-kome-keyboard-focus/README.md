# 米づくり365：音ボタンのキー操作で回答が進む問題

**音ボタンに触れた後、そのボタンにフォーカスがあるまま右矢印を押すと、カードを選んでいないのに翌日へ進む。固定10回で10/10→0/10に減った。** 初めての操作で意図しない回答が入ると、結果を理解しにくくなるおそれがある。ここで確かめたのはフォーカス中のキー経路で、タッチだけの離脱率改善ではない。全unittestは不合格で、5サイズの厳密な前後比較も一部未成立のため、draft・マージ保留とする。

修正前 `91f91d80e869cd4e370988db523b6aa7463b0304`、修正後 `43af75cce8c6023c650ac5b790f6a712bd64af71`。[回答キー処理 index.html:4115](https://github.com/shota0617/ricepia-judge/blob/43af75cce8c6023c650ac5b790f6a712bd64af71/kome365/index.html#L4115)で、他のbutton/link/input/select/textarea/role=buttonや編集領域から来たキーは回答へ回さない。body/cardの左右キーは既存の回答処理へ通す。pointer・音声・進行タイマー・見た目・保護3ファイルは変更していない。

| 同じ条件の固定再現 | 修正前 | 修正後 |
|---|---|---|
| 適格な試行 | 10/10 | 10/10 |
| 意図しない1月1日→2日 | 10/10 | 0/10 |
| 音ボタンtouch保持40ms群 | 5/5 | 0/5 |
| 同200ms群 | 5/5 | 0/5 |
| touchによる自然フォーカス / Tab使用 | 10 / 0 | 10 / 0 |
| CDP命令ACK / cleanup | 40/40 / 0 | 40/40 / 0 |

リポジトリ最上位の `python3 -m http.server 8000`、`/kome365/index.html`、作業場Chromium、844×390、isMobile/hasTouch、CPU1。通常URLと手元のthreeを使い外部要求を遮断する。各試行は新しいprocess/contextで、可視の1月1日を待ち、音ボタン中心をCDPの指で押して消音する。日付が変わらず、trusted click1回と音ボタンのfocusを確認し、`Input.dispatchKeyEvent`でArrowRightを40ms押して離す。touch保持40/200msを交互に各5回、前後同じ台本・適格条件で測った。プログラムfocusや内部日付の注入、再試行はない。実際にはTabを使わず、その経路の成功率は測っていない。

300ms予定のDOM読取は前304.311–319.472ms、後305.945–318.803msで返り、前だけ翌日だった。修正前の最初の日付通知はキーeventから194.8–217.9ms。1500ms予定の読取は前8.205–9.585秒、後1.506–1.513秒に返ったため、前を「1.5秒時点」と呼ばない。意図しない初回答を止めた結果であり、重い3D処理や一般の反応速度を改善した証拠ではない。

| 代表原画：trial01・touch40ms | キー前 | キー後 |
|---|---|---|
| 修正前 | [1月1日・消音](before-trial01-before-key.png) | [✗と翌日の内容](before-trial01-after.png)。DOMは1月2日、原画の日付は一部が✗に隠れる |
| 修正後 | [1月1日・消音](after-trial01-before-key.png) | [1月1日を維持](after-trial01-after.png) |

4枚は原byteのまま。日付・天候やアニメーション位相の画素を揃えた比較ではなく、同じ操作条件の別実行。診断原画は前後各30枚保存し、この報告の担当は代表4枚を実見した。読取・撮影の実時刻と全原画SHAは[results.json](results.json)へ。前後各子10本はconsole404各1件で実exit1のまま、系列の実outer0は完了・閉鎖の値でテスト全合格ではない。consoleにURLがなく、欠けた資源名を決めつけない。

修正前の通常プレイは、10秒無操作と写真保存後に60秒。21機会＝送信9＋未送信12、日送り9、○理由3/✗理由6、定義上の無反応0。最初のdrag classは初入力52.8ms後、初○理由class＋文字はplay16.6852秒（初入力から16.4332秒）。物理表示や人の理解時刻ではない。この通常タッチプレイと、別のキー診断10回は合算しない。

| 通常プレイ原画（修正前） | 要求→保存完了 | 読める範囲 |
|---|---|---|
| [観察10秒](observe-10s.png) | 10.0000→10.1741秒 | 1月1日・元日の田んぼ、左右の選択肢 |
| [play10秒](play-10s.png) | 10.0068→10.6490秒 | 1月2日・霜柱の朝、左右の選択肢 |
| [play30秒](play-30s.png) | 30.0009→31.2845秒 | 半透明の空カード。日付・題・選択文は読めない |
| [play60秒](play-60s.png) | 60.0073→60.8438秒 | 大きい✗と理由、七十二候、左右選択肢。日付全文は印で未読 |

30秒写真の取得中にfly→enter→whyOnが記録されており、取得に1.284秒かかったことを空白の持続時間としない。通常プレイの実outer1・console404×2と、別のfavicon資源404×2はrequest結合なし。子の実exitは独立記録なし。既知の初回答待ち（longtask5288ms、RAF間隔5300.8ms、status読取5053.6ms）は別時計の観測で、今回のキー修正に原因解消を帰属しない。

[新テスト](https://github.com/shota0617/ricepia-judge/blob/43af75cce8c6023c650ac5b790f6a712bd64af71/tests/test_kome_keyboard_focus.py#L180)は実キーhandlerを取り出す1method/61subcases。同byteのテストを旧HTMLに実行して30失敗・31成功・fixtureエラー0、新HTMLで61成功を確認した。再実行例は `python3 tests/test_kome_keyboard_focus.py`、旧HTMLには `KOME_KEYBOARD_HTML=/path/to/before-index.html` を指定する（例のパスと実行済みreceiptは別）。既存の音テストはカードへフォーカスしてキーを送り、trusted対象と回答開始も確かめる形へ調整した。既存assertは保持し、補完の全unittestで音関連15methodは全て通った。ただし全suiteは不合格。

`pytest tests/`は修正前後とも実127（`/bin/bash: line 1: pytest: command not found`）でsuite未実行。補完の全unittestは2642method＝2568成功・70FAIL・1ERROR・3SKIP、実child/outer1（586.386秒）。70FAILは変更範囲65、にしお公開文字列2、トラクター文字列1、米づくりの手本/題矩形1、検査ゲームの印と文字1。ERRORはトラクターのソース正規表現不一致後の例外。今回差分への帰属や全部が既存失敗であることは、同条件baseline未実行のため確定しない。独立監査は2642件の各結果を照合済み。

5サイズは前後各1枠、計10枠を完了した。タップで非選択10/10、左スワイプで翌日10/10、100命令/100ACK。ただし写真後の同一配置まで成立したのは844×390・820×1180の前後4枠だけで、残6枠は未成立のまま。320/390は右文、568は左文の矩形が撮影前後で変わった。親の案内アニメーションと整合するが、その時系列は未採取なので原因を断定しない。5サイズ全合格とはしない。

40保存標本のカード・音・ホーム計120観測では、画面外・中心hit不一致・内部overflowは各0、文書overflowも0/40。指定14組の重なりは0/560で、非表示要素を含み、手本と全文の連続的な重なりは対象外。同サイズ・同checkpointのcontrol矩形60対は一致し、ラベル文字80対も一致したが、ラベル矩形は13対で異なった。120は押下回数ではない。原20枚の目視では新しい文字遮蔽・control切取りを確認しなかったが、この所見で未成立6枠を合格へ変えない。

| 配置確認の翌日原画 | 修正前 | 修正後 | 厳密な前後成立 |
|---|---|---|---|
| 320×568 | [原画](layout-before-320x568-next-day.png) | [原画](layout-after-320x568-next-day.png) | 未成立 |
| 390×844 | [原画](layout-before-390x844-next-day.png) | [原画](layout-after-390x844-next-day.png) | 未成立 |
| 568×320 | [原画](layout-before-568x320-next-day.png) | [原画](layout-after-568x320-next-day.png) | 未成立 |
| 844×390 | [原画](layout-before-844x390-next-day.png) | [原画](layout-after-844x390-next-day.png) | 成立 |
| 820×1180 | [原画](layout-before-820x1180-next-day.png) | [原画](layout-after-820x1180-next-day.png) | 成立 |

配置用の原20枚から翌日10枚を無加工で掲載し、全20枚のSHAと実撮影時刻をresultsへ残した。候補の共通資産上でindex HTMLだけを前/後に切り替えた比較で、修正前リポジトリ全体を起動したという意味ではない。各子はconsole404×2で実1、系列outer0は完了・閉鎖の値。初回v1はCPU/frame quiet750ms条件が未成立で1枠・適格0・残9未実施のまま保全し、v2の成功に合算しない。v2は配置・状態の安定とframe callbackの進行を条件とし、CPU quiet/FPSを別記録へ分けた。性能改善の証拠ではない。

検証した製品・テストは候補43af75。終了後、公開base `ed4c87fd102c701d5aab4bf9b0aa03bbbca57d27` の資料12ファイルだけを取り込み、作業HEADは `0c0b433fca1ccb5c846db65e90bac4f4dcf25a10` となった。検証対象354ファイルは同byteだが、取り込み後のHEAD全体と後から加える公開資料は再検査していない。

実際の全体検査失敗が未解決なので、[ricepia-flow SKILL.md:213](https://github.com/shota0617/ricepia-judge/blob/43af75cce8c6023c650ac5b790f6a712bd64af71/.claude/skills/ricepia-flow/SKILL.md#L213)の「テストが 落ちている…変更は、マージせずに 伝える」に従いdraft・マージ保留とする。pytest未導入だけを自動保留の理由にはしていない。

運営決定の理由表示・最初の3回答・手本と進行・音声操作を変えず、`engine.js`・`field3d.js`・`cards.js`は同byte。既知の初回答待ちは運営判断を含む別候補として残す。提供文字起こしの[反応](https://www.youtube.com/watch?v=EDs5n39sRFc)・[短い手本](https://www.youtube.com/watch?v=L1Su0aajYFA)から「操作先と結果を一致させる」観点を用いた。動画本体は未再生。実機キーボード・支援技術・本物の指・傾き・回線・実音・離脱率は未測定。農作業文は既存UIの引用に限り、新しい事実は足していない。scratch原証拠の識別子は公開リンクではない。
