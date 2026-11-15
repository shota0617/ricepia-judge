# R145 必須 Node 通し・独立集計

完了済み原結果は **231終端条件中219通過・12失敗**。通過219には対象なしを許容した **3件**（yuruMeiro: no-route、alley: no-alley、mzSameCellGoal: no pair）を含む。実動作219件成功という意味ではない。253は記録group数で、objectのok=true178／false12、bare true43、その他20。明示true合計221も終端通過数とは異なる。

固定suiteの170個の直接need＋FIRST_MINUTE_NEEDの61個を確認。12失敗本文は12条件へ一対一対応し、追加crash理由・scriptStopped・nested crashedなし、errors=[]、walk4/4到達。全体R.ok=false、actual child/outer=1/1、timeoutなし。errorsは収集範囲のページエラーで、Leaflet関連除外もあるため全console/HTTPエラー不在とは書かない。

| key | 原判定で未達だった点 |
|---|---|
| godotRec | shade=0。errs=[]、len=5908は成立。描画例外とは断定しない。 |
| swipeHold | g4≠want、離指後g3≠g4。記録ms615は判定項目でなくcfg.ms300が条件。 |
| restFinger | tap=false／swipe=false。pinch=false・touchAction・info=falseは成立。 |
| tiltDemoShown | on=false／phone=false。force0.28は成立。実機センサーではない。 |
| a2hsAutoHide | 6秒上限hidden待機off=false。その後again=falseで、再表示や永久表示とは断定しない。 |
| tapDemoQuick | 7記録の中央値2264msが<1700msを未達（最短2095ms）。 |
| lowDemoKept | 最初a.inMap=false、後のb.inMap=true。恒久非表示・画面外とは断定しない。 |
| lowGoalDemo | 568×320/k1だけshown=false、位置null。他3行は成立。 |
| rollNoDemo | vmax=0とfresh=true。bad=0を転がり中の成功証拠にしない。 |
| infoSecondTap | 窓未開。2クリックはpxCanvas、form=false。危険な窓内2回タップではない。 |
| infoRotate | phone/tabletとも初期窓未開、close入力は未送信。閉じられないとは断定しない。 |
| speedLines | far1.18のみ>1.5を未達。fast0、vmax3.99は成立し、線出現ではない。 |

root閉鎖記録はlive0、旧所有PID3消滅、port8899 connect errno111、plain bind errno98、REUSE bind成功。plain bind成功へ読み替えない。source338（Python tests315）とdeps550の記録は前後・manifest一致、source338は本監査でも再hash一致。製品HEAD69c0891a…、記録status空。wrapper19:48:52.529831→20:17:19.462315 UTC＝1706.932484秒（約28分27秒）。child開始は19:48:54.599800、厳密終了時刻は別記録なし。

R141から失敗数が10→12になった因果は未確定。前回の原因を転記しない。今回のwhole skipは3件で前回2件と異なる。自然初見、補助fixture、実機、離脱率とは別の通し結果。原結果SHA `27a8fc2cc60765664491ccabff6d059f374e0f565f0400a6fd3ebddf1d331db3`。全12の原本文・真偽項・行番号・証拠SHAはcount-audit.jsonに保存した。

静的読取・集計だけ。新規Node/browser/parse/test/Git/HTTP実行0、製品・既存証拠・frozen変更0。
