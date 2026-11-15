# R146 通常primary：初回送信と初反応の時刻

新runtime0。原report SHA `06a4980943a886fad463be776c49b2993d2a824f14c84d955aa9a376ba3db177` を静的再計数した。JSON pointerの配列添字は0始まり。既存primary-auditは変更せず、この追補で時計と「最初」の定義を詳しくする。

初回touchStartのNode送信記録は `/gestures/0/sends/0`：monotonic 55276249.125863ms、epoch 1794775539100ms。これは `cdp.send` 直前の記録で、ACKや実指の接触ではない。Node play開始からは0.251529秒。browser playMarkerはperformance 10582.5ms、timeOriginは1794775528269.3ms。

| 採取した状態 | browser playMarkerから | 初回touchStart送信から（epoch対応の近似） | 原report位置 |
|---|---:|---:|---|
| `.drag` 初記録 | 0.2821秒 | 約0.0339秒 | `/events/ui/1` |
| transform 初記録 | 0.3092秒 | 約0.0610秒 | `/events/ui/2` |
| 1月2日／✗本文のDOM設定 | 0.7201秒 | 約0.4719秒 | `/events/ui/9` |
| 最初の✗ mark可視proxy | 0.7297秒 | 約0.4815秒 | `/events/ui/10` |
| 最初の○本文のDOM設定 | 19.7738秒 | 約19.5256秒 | `/events/ui/28` |
| 最初の○ mark可視proxy | 19.7807秒 | 約19.5325秒 | `/events/ui/29` |
| ✗理由の可視proxy | 0.8657秒 | 約0.6175秒 | `/events/heartbeats/43` |
| ○理由の可視proxy | 20.5724秒 | 約20.3242秒 | `/events/heartbeats/91` |

`.drag` はクラス変化、transformは最初の16.6667px移動値の記録。日付／✗本文の設定時点ではcardVisible/whyVisibleはfalseなので、読むことができた時刻とは呼ばない。✗・○ markの分類は同じUI記録のwhyText先頭記号を根拠にし、markOn=true、markVisible=true、opacity1を確認した。可視proxyはrectがviewportと交差し祖先display/visibility/opacityを満たす判定で、他要素による遮蔽や画面提示を証明しない（helpers117–122）。

「最初の肯定」は上表の○ mark可視proxyと定義する。初回送信から約19.5325秒は、先行2回答・意図した待ち・手本待ち・処理停滞を含む。単一入力の応答遅延ではない。○を生んだ3操作目自身のtouchStart（`/gestures/2/sends/0`, epoch1794775557337）からは約1.2955秒。

最初のtransformがあるrAF採取機会はplay+0.3221秒／初送信から約0.0739秒。✗ markはplay+0.7339秒／約0.4857秒、○ markはplay+19.7823秒／約19.5341秒。helpers204はrequestAnimationFrame callback内で採取しており、paint完了を測っていない。理由はmutationだけで探すと遅い記録になるため、heartbeatも含めて最初の可視proxyを探した。原4PNGはこの初反応の瞬間の画像ではなく、初出音の実測もない。

時計対応は `browser timeOrigin + browser at − Node sentEpoch` で近似した。Node play epoch1794775538848に対しbrowser marker epoch1794775538851.8は約3.8ms後だが、helpers314–316はNode開始後に別page.evaluateでmarkerを置く。記録位置と送受信の遅れも含むので、3.8msを純粋なclock skewとして一律補正しない。browser play相対値からNode play相対の0.251529秒を直接引く計算もしない。

さらにhelpers364はCDPへ `timestamp: sentEpoch/1000` を明示する。native eventTimeStampとNode epochが合うことは独立した時計較正にならず、実指のハードウェア遅延でもない。Node epochは整数msで、sentAtより後に記録される。0.1msのbrowser小数を使っても、プロセス間の精度が0.1msと確定するわけではない。

近接した `/reads/0` の送受信・browser開始終了から、同一rateを仮定するとNodeMono−browserPerfは55265415.435442～55265426.533098ms（幅11.097656ms）に収まる。これを初反応まで一定と仮定した送信→`.drag`対応幅は30.910～42.007ms、transform58.010～69.107ms、日付468.910～480.007ms、✗ mark478.510～489.607ms。epoch近似はこの幅の内側だが、これは条件付きの対応確認であり、統計的信頼区間・20秒間の無drift保証ではない。各行の条件付き幅をJSONに保存した。

同一browser時計内ではpointerdown captureから`.drag`記録まで6.4ms、最初のpointermove captureからtransform記録まで3.7ms。こちらもDOM観測タイミングであり、物理画面への提示時間ではない。SwiftShaderと既知の処理停滞を伴うローカル1runの結果として扱い、実機一般の速度や離脱改善へ外挿しない。
