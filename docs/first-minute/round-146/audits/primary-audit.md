# R146 通常 primary の独立追補

原 report/driver/extra と終了記録を静的集計し、原4 PNGを各1枚ずつ original 表示で実見した。新しい実行・製品変更は0。既存 notes/candidates は完了前の静的候補として固定保持する。

844×390、通常 motion、実時計10秒観察＋60.002205秒操作。操作機会21のうち送信8、未送信13。64 CDP commands に対し trusted native29（down8/up8/move13）、8件すべてに次日付があり1月1日→9日。未送信の手本待ちを無反応に数えない。無反応0は「送信後に次日付が記録されなかった操作0」という限定で、待ちや全中間フレームの正常性を意味しない。

browser playMarker基準で初dragクラス0.2821秒、初transform0.3092秒、日付更新0.7201秒、✗の可視判定0.7297秒。理由の最初の可視記録はheartbeat0.8657秒（mutationだけを探すと1.3399秒）。初○本文19.7738秒、○mark可視19.7807秒。最初の肯定は3操作目。入力と同じbrowser時計内で初pointerdown→初drag記録34.0ms。Node開始epochとbrowser開始epochに約3.8ms差があるため混ぜない。

指定120msに対しNode送信開始→終了119.955–129.334ms、native eventTimeStampの接触期間約120–129ms。native handlerの処理間隔は同値ではなく、後半は移動イベントがまとまり、pointerdownの最大配信遅延1054ms。最大longtask5.282秒はplay+2.4099秒開始、browser heartbeat最大6.3463秒/rAF最大5.3132秒。loaderState2/Three128のUI記録は2.3873秒。時間的近接はあるが原因確定ではない。GPUはSwiftShaderで、実機一般へ速度を外挿しない。保護されたfield3d等の修正候補へ昇格しない。

原観察10秒写真は1月1日、操作10秒は1月2日、30秒は1月5日、60秒は1月9日。両札・日付・題名はこの4枚で読めた。30秒の✗と右上案山子、60秒の○と左の田状態図は重なっているが、保護表示を変更する根拠や新規不具合に数えない。60秒写真の理由は読める。写真取得は要求後164/764/759/1294msの区間であり、要求時刻の同一フレームとはしない。

actual exit1はconsole404が2件。reportのconsole本文にURLはないが、同run extraのresource timingにfavicon.ico404が2件ある。pageerror0、blocked0、送信拒否/lateCleanup0、全4写真保存、browser閉鎖・CPU reset・source7/env8/HTTP5同一は終了記録で確認。実Field3D active/Three128、アプリ音ON/context runningを確認したが、物理出音を聴いた証拠ではない。

A1静止矢印は reduced-motion 条件なので通常primaryでは未判定。A2は真のvisibility離脱を操作しておらず未判定。確認済み新規不具合0、改善実装0、離脱改善実測0。次は正規 reducedMotion=reduce のfresh844×390で10秒無入力、原PNGと両矢印/左右札のRange・box・hitを記録する最小pilotが妥当。矩形重複だけで遮蔽を確定せず、原画像を別途確認する。
