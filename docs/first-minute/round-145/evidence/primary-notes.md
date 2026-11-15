R145 primary の独立数値監査。対象は preparation-bound145/follow.json（af812e844dd60306b8a5369fc5b85aca1d68d8552f813692d450369e791a7859）と同一実行の記録だけ。原 JSON を Python で再集計し、既存 classifier の各行・初反応・初可視正ポイントとの不一致は 0。ブラウザ・Node・ゲーム・テスト・HTTP・Git の実行は 0、製品編集は 0。今回の担当では PNG は未実見（root の原画像確認とは区別）。

10 操作すべて可視手本中心、うち通常手本 9、初回手本 1。各操作に trusted touch の pointerdown / pointerup / click が各 1 件（ID 2～11）、実 target は canvas。全 10 操作で開始・終了 ACK、ACK 完了後 1,100 ms 以上の記録窓を確認。座標変化を各窓 1 件以上記録し、記録対象反応なし 0、不完全窓 0、世界地図開 0、情報開 0。可視手本がない読み取り 378 件は入力失敗に数えない。入力選択は可視 UI に従い、G.me・goal は読取り観測にだけ使われる。座標差を進路の正しさ・因果・人の理解に読み替えない。

保持時間は Node 送信差 40～41 ms、eventTimeStamp 差 39.9～41.0 ms。後者には CDP 指定 timestamp が反映されるため、実配送間隔と同一視しない。ブラウザのリスナー記録差は別途 1.3～2.2 ms。開始 ACK は送信から 43～77 ms、終了 ACK は終了送信から 64～128 ms。初記録反応は play 0.158300 秒／最初の送信から 129.300 ms、各操作の初反応遅延は 102.5～167.1 ms。

初めて可視・中心非遮蔽として記録された正ポイントは「30」、play 0.157800 秒／最初の送信から 128.800 ms。観察中から正ポイントがあった例ではない。pointChanges は報酬抽出には含むが反応 classifier の集約には含まないため、初ポイントが初反応より 0.5 ms 早い値は矛盾ではない。これは DOM 観測であり、実ペイント時刻・報酬付与時刻・体感を直接測る値ではない。

初期観察開始から操作開始までは 10,141 ms、play の期限は 60,000 ms。新規入力は 0.029～55.384 秒、期限後の開始・release・完了はすべて 0。期限 callback は記録上遅延 0 ms。play 10/30/60 秒の撮影要求は各指定時刻、完了は +193/+206/+221 ms。trace は期限後 +224.900 ms で停止、report finish は +6,665 ms。期限後の raw samples 4 件は残し、60 秒の判定窓へ混ぜない。撮影は単一の同一 frame を保証しない。play 内の周期 sample は 869 件（最大隣接間隔 269.5 ms）、rAF timestamp は 1,742 件（同 166.7 ms）で、連続観測ではない。

root actual exit 0（b26f1f）、子 process exit 0、要求 exit 0。console/page、入力、撮影、HTTP error、request failure、未終了 touch、condition error はすべて 0。外部 URL は 4 種、空応答処理 6 回として別記し、179 回の continue はすべて localhost:8000、Leaflet のローカル供給 2 回。外部遮断を正常な外部通信成功としない。source 15・environment 16・HTTP 6 の前後記録は同一、browser closed true、root 確認の残存 browser は 0。

初回 root serialization 確認の actual exit 1（17e45e）は、root が末尾の余分な space を想定した事前検査の失敗。5 script parse は成功しており、原入力を変えず再照合後 0（aab3c4）。この記録を保存したまま、ゲーム実行時エラーと分ける。今回の数値一致は 1 回の自然 60 秒プレイの範囲であり、人の離脱低下や全経路成功は未測定。
