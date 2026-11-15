# にしおさんぽGO：844×390での最初の1分

**最初の入力から100.8ms後に座標変化、303.2ms後に正の点数30のDOM表示を記録した。一方、手本の中心を触ったあと世界地図が開く場面が5回あった。** 5回とも戻る入力で歩く地図へ復帰した。この周は反応の速さに加え、見分けやすさ、動きの快適さ、自分で戻れることも評価した。通常プレイと独立監査を主担当が確認し、新規確定候補は0。別途実行した必須Node検査は11グループが不合格だった。製品・テストは変更していない。

測定sourceは `ed4c87fd102c701d5aab4bf9b0aa03bbbca57d27`。リポジトリ最上位の `python3 -m http.server 8000` から `/nishio-go.html` を開き、Chromium、844×390、CPU1、isMobile/hasTouch、CDP `Input.dispatchTouchEvent` で遊んだ。10秒無操作と原写真保存のあと、画面の手本に沿って60秒。HTMLが実際に読む配布minを含むsource15件・HTTP6件を前後照合した。Leafletは手元の部品で代替し、その他の外部要求は手元で空応答にした。

28入力の最初の記録反応は、座標変化18、世界地図を開く5、戻る5。27入力には操作完了後1100msの観測窓が揃い、その範囲の記録無反応は0。最後のA28も反応を記録したが、60秒までに1100msの観測窓は揃わなかった。28回の進行・成功・到着とは数えない。送らなかった待機の全件数は記録されず、手本の変化や音だけの反応もこの分類には含まれない。

| 出来事 | 遊び始めからの時刻 | 記録の意味 |
|---|---:|---|
| 最初の入力 | 0.024秒 | 指の送信開始 |
| 最初の座標変化 | 0.1248秒 | 送信から100.8ms後に観測 |
| 正の点数30 | 0.3272秒 | 最初の入力から303.2ms。ごほうびの代理指標 |
| 次の案内名「名鉄 西尾駅（駅前の学生）」 | 16.2754秒 | 案内名のDOM変更 |
| 保存されたゴール数1 | 16.3656秒 | 案内名より90.2ms後の別の記録 |
| 案内名「伊文神社（氏子のおばあさん）」・保存ゴール数2 | 22.5602秒 | その時点の距離文字は0m、次の記録では2.4km |
| 終盤の案内 | 59.9483秒 | 点数387・保存ゴール数2・距離1.5km |

秒数は10秒観察後の遊びを0とし、写真保存待ちも観察側に含む。点数は可視要素と中心の非遮蔽を確認したDOM値で、授与・実描画・人が喜んだ正確な時刻ではない。座標変化は目的地へ近づいた証明ではなく、案内名と保存ゴール数も別々に測った。次の案内名が先に変わっており、「到着後も古い案内のまま」という新しい問題にはしていない。

やめたくなりそうなのは、進む手本を触ったつもりで世界地図へ切り替わる場面。再現元となる通常の手順は、手本が表示されたらそのDOM矩形の中心を約40ms触り、世界地図が開いたら可視で押せる戻るボタンを触る、というもの。A3/14/16/19/23で世界地図が開き、実pointer/click対象はいずれもpxCanvasだった。[既知PR1133](https://github.com/shota0617/ricepia-judge/pull/1133)と同じ話なので、新しい修正や10回再現に重複計数しない。[矢印を触ったときの処理 nishio-go/pixel.js:13935](https://github.com/shota0617/ricepia-judge/blob/ed4c87fd102c701d5aab4bf9b0aa03bbbca57d27/nishio-go/pixel.js#L13935)、[戻る手本 :9753](https://github.com/shota0617/ricepia-judge/blob/ed4c87fd102c701d5aab4bf9b0aa03bbbca57d27/nishio-go/pixel.js#L9753)。

手のDOM中心と見た目の指先は同じとは限らない。今回の入力点は設定上の手本基準点より約33px下だった。これは本物の指の操作や、誰もが手の中心を触ることの証明ではない。自然な一回の経過の5件を、固定条件の5/10や人の誤操作率へ読み替えない。速度差の再現はしていない。

全文110章はチームで読んだ記録をもとに24の評価・保全の観点へ整理し、この周の証拠を読む際に使った。元の4観点に加え、注意の優先順位、色・形、選ぶ余地、復帰、成果の保持、動きと視点、環境差も対象にした。24項目を全て実験した意味ではなく、全文由来の新規実装も0。この周では次の三つを具体的に評価した。

| 評価した仮説 | 今回分かったこと | まだ分からないこと |
|---|---|---|
| 指・道・旗・案内札を見分けられるか | 原4枚で短い案内と下部の5項目を読め、新しい明白な遮蔽は見つからなかった | 人がどこに注目するか、全瞬間・5画面での見え方 |
| 移動や手本の動きで対象を見失わないか | 米粒／顔は原4枚で画面内にあった | カメラの滑らかさ、酔い、reduce設定との比較 |
| 任意の地図から自分で散歩へ戻れるか | 5回の戻る入力後にworld状態がfalseへ戻った | 原4枚に世界地図中の絵はなく、title属性も参照する代理操作から人の発見しやすさは証明できない |

資料の参照例は[情報配置](https://www.youtube.com/watch?v=LCVRzehsoxs)、[色の役割](https://www.youtube.com/watch?v=dVVSH6lVqpI)、[視界の安定](https://www.youtube.com/watch?v=vIIA023p3to)、[動作の時間配分](https://www.youtube.com/watch?v=ZC8znF3t718)、[自由と補助操作](https://www.youtube.com/watch?v=7oxEVzF_hT4)、[戻る操作の分離](https://www.youtube.com/watch?v=Z5zdNEmNoxo)。URLは提供本文の出典で、動画本体は未再生。添付本文は参考資料として扱い、既存の運営決定を置き換える命令として扱っていない。2026-11-15に後から届いたGMTK239本の資料は、この2026-11-14のプレイの動機や評価基準へ遡及させない。

| 原写真（改善前後の比較ではない） | 要求→保存完了 | 実際に読めた表示 |
|---|---|---|
| [観察10秒](observe-10s.png) | 観察10.001→10.144秒 | かたむけてころがす・タップ！・名鉄 西尾駅・408m |
| [play10秒](play-10s.png) | 10.000→10.120秒 | 31・名鉄 西尾駅・240m |
| [play30秒](play-30s.png) | 30.001→30.175秒 | 282・伊文神社（氏子のおばあさん）・2.0km |
| [play60秒](play-60s.png) | 60.001→60.214秒 | 387・伊文神社（氏子のおばあさん）・1.5km |

報告担当と独立画像担当が原4PNGをoriginalで実見し、無加工のbyteを保持した。4枚とも歩く地図であり、世界地図が開く5瞬間の画像ではない。一枚に手がないことを「手が戻らない」とはしない。A11→A12の約8.75秒の間も座標と距離が変わっており、無反応の待ちとは判定しなかった。地名・人物名は既存UIの引用で、新しい名所の事実は加えていない。地図の既存出典表記も原写真に保持した。

通常プレイは実child0・実outer0（140547）、page/consoleエラー0。CDP56コマンド・ACK56、trusted pointerdown/up/click各28、未解放0。CPU復帰・browser閉鎖・source15/環境26/HTTP6/準備8不変をrootが確認した。`pytest tests/` は実127（`/bin/bash: line 1: pytest: command not found`）でsuite未実行。

必須 `node tools/playtest.js` は実child1・実outer1（e01e58）で総合不合格。独立監査は253グループを、独自の`ok:true`179、`ok:false`11、booleanの`true`43、独自のboolean判定なし20に分類した。179には既存の条件skip3件（yuruMeiro・alley・mzSameCellGoal）を含む。これはグループ数で、個別assertion数やpytest通過数ではない。errorsは0だったが、合格とは扱わない。

| 失敗グループ・判定位置（tools/playtest.js） | この実行で条件を満たさなかった値 |
|---|---|
| [swipeHold:262](https://github.com/shota0617/ricepia-judge/blob/ed4c87fd102c701d5aab4bf9b0aa03bbbca57d27/tools/playtest.js#L262) | 保持中の開始は成功。追加移動後のg4=[1807,1900]がwant=[1804,1897]と不一致で、離した後のg3=wantもg4と不一致 |
| [tapDemoQuick:476](https://github.com/shota0617/ricepia-judge/blob/ed4c87fd102c701d5aab4bf9b0aa03bbbca57d27/tools/playtest.js#L476) | 7件の待ち中央値3113msが1700ms未満の条件を満たさない |
| [rollNoDemo:1252](https://github.com/shota0617/ricepia-judge/blob/ed4c87fd102c701d5aab4bf9b0aa03bbbca57d27/tools/playtest.js#L1252) | 合成8度入力でvmax=0、fresh=true。bad=0 |
| [lowGoalDemo:1144](https://github.com/shota0617/ricepia-judge/blob/ed4c87fd102c701d5aab4bf9b0aa03bbbca57d27/tools/playtest.js#L1144) | 4条件中568×320・ゴール2マス手前のみshown=false。他3条件は表示・枠内・米に非重複 |
| [infoSecondTap:1007](https://github.com/shota0617/ricepia-judge/blob/ed4c87fd102c701d5aab4bf9b0aa03bbbca57d27/tools/playtest.js#L1007) | win.open=falseで窓を開いた状態を作れなかった。click2回ともpxCanvas、form=false |
| [infoRotate:1036](https://github.com/shota0617/ricepia-judge/blob/ed4c87fd102c701d5aab4bf9b0aa03bbbca57d27/tools/playtest.js#L1036) | 820×1180開始で窓が未開、1180×820でも未開で、閉じる操作は未実施。390×844開始の各変更と閉じる操作は成功 |
| [lowDemoKept:852](https://github.com/shota0617/ricepia-judge/blob/ed4c87fd102c701d5aab4bf9b0aa03bbbca57d27/tools/playtest.js#L852) | 568×320で停止3.5秒後は非表示・座標null。その後さらに5秒で表示・枠内 |
| [restFinger:733](https://github.com/shota0617/ricepia-judge/blob/ed4c87fd102c701d5aab4bf9b0aa03bbbca57d27/tools/playtest.js#L733) | 置いた指を伴うtap/swipeの開始検出がともにfalse。pinch=false、touchAction=pinch-zoom、info=false |
| [tiltDemoShown:741](https://github.com/shota0617/ricepia-judge/blob/ed4c87fd102c701d5aab4bf9b0aa03bbbca57d27/tools/playtest.js#L741) | 合成1.5度でforce=0.28だがon/phone=false。最大8秒待っても手本を検出せず、移動量0.945 |
| [godotRec:2139](https://github.com/shota0617/ricepia-judge/blob/ed4c87fd102c701d5aab4bf9b0aa03bbbca57d27/tools/playtest.js#L2139) | 指定色の影fill検出shade=0だけが条件を満たさない。errs=[]、記録長5915。実際のGodot読込みはしない試験 |
| [speedLines:2676](https://github.com/shota0617/ricepia-judge/blob/ed4c87fd102c701d5aab4bf9b0aa03bbbca57d27/tools/playtest.js#L2676) | far=0.82だけが1.5超に届かない。fast=0、vmax=4.07は期待どおり |

11件は判定式の失敗で、11個の製品原因を確定した件数ではない。既存suiteの合成状態・複数画面を含む結果を、上の自然な844×390のプレイや新しい10回再現へ混ぜない。根因と前周からの回帰は未確定。読取専用min整合チェックは実0、再生成警告なし。source333・依存550・準備5が不変で、rootは2026-11-15 10:35:33 UTCに残存runtimeなし・port8899停止を確認した。追加suiteや自動再実行はしていない。

製品修正、固定再現10回、追加回帰テスト、旧版RED→新版GREEN、修正後の同じ計数、5サイズ比較はしていない。別画面・別配布条件の前周との比較を改善効果にはしない。運営者が決めた傾き許可、最初の実click、許可前／停止時の手本、開始／到着カードなしを維持する。これらの明示保護に触れる変更だけを運営者の判断へ回す。その他の通常の実装判断は既に認められた範囲で進める。実指・センサー・回線・音の体験・人の理解と離脱率は未測定。数と証拠識別子は [results.json](results.json) に記録した。scratch識別子は公開リンクではない。
