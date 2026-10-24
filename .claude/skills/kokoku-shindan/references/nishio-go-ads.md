# にしおさんぽGO の 広告・宣伝（広告診断スキルの C）

くわしい 手順と 広告の 文は `docs/ads-game-kit.md`。開発・PR・マージの 決まりは `.claude/skills/nishio-go-dev/SKILL.md`（マージは「マージ」と 言われた ときだけ）。

## この 環境で できる こと・できない こと

- **できない**：Google広告・Meta・LINE・インスタの 管理画面に 入る こと（認証情報も つなぐ 手段も ない）。「広告に 追加して」と 言われても、アカウントは 変えられない。
  - かわりに、貼って 動かす スクリプト（Google広告）か、アップロードする 画像を 用意して `SendUserFile` で 送る。どこに どの 画像かを 表に して 伝える（下の「画像と 使う 所」）。
  - 環境変数 `GOOGLE_ADS_*` が あれば、`node tools/google-ads-run.js` で API から 動かせる（まず 検証だけ → `--apply`）。値は チャットに 書いて もらわない（環境の 設定に 入れて もらう）。
- **できる**：スクリプト・画像・文を 作って PR、Actions の ワークフローを 動かす（GitHub の MCP の `actions_run_trigger`）、ricepia.jp の アップロード（下の 手順。さくらの フィルタは ユーザーに 切って もらう）。
- go.ricepia.jp・ricepia.jp は この 環境の プロキシで 止められて 見られない。公開後の 見た目は ユーザーに 見て もらう。

## Google広告

| スクリプト | すること | 動かし方 |
|---|---|---|
| `tools/google-ads-game-2026-10.js` | いまの キャンペーン（P-MAX #2・新米２）に サイトリンク「お散歩ゲーム（無料）」と コールアウトを 付ける | `--job game` |
| `tools/google-ads-game-campaign-2026-10.js` | ゲーム専用の デマンド ジェネレーション「にしおさんぽGO ゲーム」を **一時停止で** 作る。コンバージョン「にしおさんぽGO ゲーム開始」で 入札。アカウントの 目標（LINE 重視）は 変えない | `--job game-campaign` |
| `tools/google-ads-apply-2026-10.js` | 10月の 見直し（docs/google-ads-review-2026-10.md） | `--job` なし（`--step2`） |

- どれも 何度 動かしても 同じ 結果（もう ある ものは 飛ばす）。管理画面の 「スクリプト」に 中身を 貼り →「プレビュー」→ ログの「できなかった:」を 見る →「実行」。
- 新しい スクリプトを 足したら `tools/google-ads-run.js` の `JOBS` に 足す。API に つながらない ので、**にせの API サーバー**（`GOOGLE_ADS_API_ENDPOINT`・`GOOGLE_ADS_TOKEN_URL` を ローカルに 向ける）で 検証だけ・反映・2回め（変更 0回）を 確かめる。
- ゲーム専用キャンペーンの 続き：ログの「★ ゲームに入れるラベル」を `nishio-go/analytics.js` の `CFG.adsGameStart` に 入れる（空の 間は 送らない）→ 公開 → 管理画面で キャンペーンを「有効」。予算を 使いはじめるのは ここから。
- 広告の 文を 変えて サイトリンクを もう一度 作ると、前のが 残ったまま 足される（同じ 文で 探して 使いまわす しくみ）。文を 変えるときは 前のを 管理画面で 消す。

## 画像・動画（Make Nishio promo）

- `tools/make-promo.js` が ほんとうの ゲーム画面から 作る。画像は `mkt/nishio-go/` に コミット、動画（mp4）は Actions の 実行ページの Artifacts（nishio-go-promo）。
- 作りなおす：Actions「Make Nishio promo」を 動かす（`actions_run_trigger`、`make-promo.yml`、作業ブランチを ref に すれば その ブランチに コミットされる）。main では `tools/make-promo.js`・`make-reel.js`・`record-page.js`・`nishio-go/logo.svg`・ワークフローを 変えると 自動で 動く。
- **この 環境で 動かすのは 確認用だけ**。`/opt/pw-browsers/chromium` は 古い headless が なく 動かない。`headless_shell` だと 動くが、静止画が 3×3 に ならんで 写る ことが ある。コミットする 画像は Actions で 作る。
  - 動かす なら：`npm install --no-save playwright@1.48.2 leaflet@1.9.4`（スクラッチの フォルダで）、`NODE_PATH=…/node_modules CHROMIUM=/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell LEAFLET_DIR=…/leaflet/dist node tools/make-promo.js <スクラッチ>/promo-out`
- 台本は いまの ゲームの ボタンに 合わせる。ゲームから ボタンが なくなると 台本が とちゅうで 止まり、ワークフローが 赤く なる（「おまかせ歩き」が なくなった とき そう なった）。
- 作ったら 画像を `Read` で 見て、ロゴ・字幕・画面が 正しいか 確かめる。

### 画像と 使う 所

| 画像 | 使う 所 |
|---|---|
| `ad-1200x628.png`・`ad-1200x1200.png`・`ad-960x1200.png` | Google（ゲーム専用キャンペーンは スクリプトが go.ricepia.jp から 自動で 上げる） |
| `ad-1080x1080.png`・`ad-1080x1350.png`・`ad-1080x1920.png` | Meta（フィード・ストーリーズ・リール）、インスタ |
| `ad-1200x628.png`・`ad-1080x1080.png`・`ad-600x400.png` | LINEヤフー広告 |
| `richmenu-2500x1686.png` | LINE リッチメニュー（マスの 位置は 前と 同じ。アクションは 変えない） |
| `nishio-go/icon-512.png` | Google広告の ロゴ（1:1）、ホーム画面の アイコン |

## タイトルロゴ・アイコン

- タイトルロゴ：`python3 tools/make-logo.py` → `nishio-go/logo.svg`。広告の 画像・OGP・ricepia.jp の お知らせ欄が 同じ 絵を 読む。変えたら promo が 自動で 作りなおす。OGP は `node tools/make-ogp.js`。
- アイコン：`python3 tools/make-icon.py` → `nishio-go/icon-512.png`・`icon-192.png`。ロゴの O と 同じ お米と 芽。丸く 切りぬかれても 欠けない よう、絵は まん中の 8割（512px で 半径 205px の 中）に おさめる。

## ricepia.jp の お知らせ欄を アップロードする

`ricepia-jp/README.md` の とおり。さくらの「国外IPアドレスフィルタ」が 有効だと GitHub から FTP できない。

1. ユーザーに フィルタを「無効」に して もらう（さくらの コントロールパネル →「セキュリティ」）。
2. 作業ブランチを main に そろえ、`tools/build-ricepia-jp.py ricepia-jp/current.html <スクラッチ>/new-index.html` で 中身を 確かめる（`game-section.html` の 文と、`src` の 画像が リポジトリに ある か）。
3. **作業ブランチだけに** `ricepia-jp/deploy.txt`（中身 `deploy`）を コミット・push。main には 入れない。
4. `actions_run_trigger` で `ricepia-jp.yml` を 作業ブランチで 動かす。1分くらい。
5. ジョブの ログ（`get_job_logs`）で「アップロードしました（元のファイルは www/index.html.bak-日時）」を 確かめる。成功でも「確認だけ」「シークレットが未設定」なら 上がって いない。
6. `deploy.txt` を 消して、`ricepia-jp/README.md` の「記録」に 1行（日時・何を・bak の 名前）。
7. ユーザーに「フィルタを 有効に 戻して ください」と 伝え、ブラウザで 見て もらう。戻す ときは bak を `index.html` に 名前を 戻す。

## 報告の しかた

- 「できた こと」と「ユーザーが 管理画面で する こと」を 分けて、表で。お金が かかりはじめる 操作（キャンペーンを 有効に する など）は はっきり 書く。
- 本物の API・本番で 確かめて いない ことは「まだ 確かめて いない」と 書く。
