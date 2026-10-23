# セキュリティの見なおし（2026-10-23）

運営者のことば：「セキュリティチェックをお願いします。過去の履歴、最新の状況などをリサーチした上で統合的に」→「セキュリティの指摘を直して」。
2つに分けて調べた（読むだけ）：git の全履歴（約920コミット）の秘密の漏れと GitHub Actions・運用まわり／いま公開しているサイトと API。
履歴・いまのファイルとも、API キー・トークン・パスワードの漏れは見つからなかった。

## 直したこと

| 指摘 | 直し方 |
|---|---|
| 店内ビデオ通話（`tsunagu.html`）が、ページを開いた だれでも入れた（部屋の名前が決まった文字で、着信に自動で出る） | はじめに各端末で「お店の合言葉」（6文字以上）を1回入れる。部屋の名前は合言葉の SHA-256 から作り（合言葉そのものは保存しない）、ほかの部屋の端末からの通話・データは受けない。⚙ で入れなおせる |
| おたよりの自動処理（`feedback.yml`）で、Claude が確かめ用のファイル（`.feedback/items.json` など）まで書きかえられた（おたよりに まぎれた指示で、転載の確かめを すりぬけて「こえ」に好きな文を出せた） | Claude が書けるのは `.feedback/results.json` だけに。items・rids・status の正本は作業場所の外に置き、Claude のあとで上書きしてもどす。`voices.json` に書く返事は、決まった様子（7つ）と 120字までの文だけ |
| Issue のコメントで動く AI（`claude-dev.yml`） | コメントでの起動を、リポジトリの持ち主・メンバー・共同作業者のコメントだけに |
| 作業用ブランチへの push で、ricepia.jp を書きかえる自動処理（`ricepia-jp.yml`）が動いた | main への push だけで動く |
| 精米判定（`index.html`）で、AI の返事をそのまま HTML に入れていた（写真に書いた文字で返事が変わると、画面でプログラムが動く道があった） | AI の返事の文字は ぜんぶ HTML の特別な文字を置きかえてから使う（`escDeep`）。外へのリンクに `rel="noopener"` |
| 社内の文書・スクリプト・GitHub の自動処理・ricepia.jp の HTML の写しが、公開サイトでも配られていた | `.vercelignore` で公開サイトから外した（`/.github` `/docs` `/monitor` `/ricepia-jp` `/godot` `*.md` `/tools/*`。トラクターの 3D モデル `tools/tractor/` は のこす）。ゲーム・社内ツールのページが読むファイルは外していないことを、ファイルの一覧で確かめた |
| セキュリティ用のヘッダーがなかった | `vercel.json` で ぜんぶのページに `X-Content-Type-Options: nosniff`・`Referrer-Policy`・`X-Frame-Options: SAMEORIGIN`・`Permissions-Policy`（カメラ・マイク・位置・傾きは このサイトだけ） |
| おたよりの API（`api/feedback.js`）が、`https://本物のサイト@べつのサイト/` のような見まちがえる URL を受けた | ユーザー名・パスワードの入った URL は受けない |
| プライバシーポリシーの送り先に 気象庁がなかった | `nishio-go/privacy.html` に足した |

## 運営者にしかできないこと（まだ）

- **GitHub**：main のブランチ保護（直接の push を禁止・PR を必須）。Settings → Branches
- **Zoom**：パーソナルミーティング（ID 544 001 0563。README・`tsunagu.html` に書いてある）に、待機室かパスコードを
- **店内ビデオ通話**：各端末で「お店の合言葉」を入れる（同じ合言葉で そろえる）。合言葉は店の外に出さない
- **使用量の見張り（`monitor/check.mjs`）**：上限（1日$10・月$100）をこえると ぜんぶの API キーを自動で止める。上限の見なおしか、はじめは知らせるだけに
- 昔の `index.html` に書いてあった管理者パスワード（いまは消してある。履歴には のこる）を、ほかのサービスで使っていたら 変える

## 2回目に直したこと（はじめは見送ったもの）

運営者のことば：「見送った指摘も直して」

| 指摘 | 直し方 |
|---|---|
| GitHub Actions の外の部品を、版の名前（`@v4`・`@v1`）で使っていた（あとから中身を差しかえられうる） | ぜんぶのワークフローで、版の コミットの SHA に固定（`actions/checkout`・`setup-node`・`upload-artifact`・`cache` の v4、`anthropics/claude-code-action` の v1。行の終わりに `# v4` などと残した）。版を上げるときは SHA も書きかえる |
| 社内ツール（`meeting.html`・`marketing.html`）の API キー・GitHub トークンを「記憶する」と ブラウザ（localStorage）に のこり、同じサイトの ほかのページに 穴があると ぬすまれうる | キーと トークンは このタブの あいだだけ（sessionStorage）に。「記憶する」を なくし、前に記憶した キー・トークンは 開いたときに 消す。タブを閉じたら もう一度 入れる |
| AI の遊びテスト（`play-improve.yml`）の Claude が どのファイルでも 書けた（遊ぶ道具 `tools/ai-play.js` を 書きかえて 動かせた） | 書けるのは `nishio-go/`・`nishio-go.html`・`docs/play-improve.md`・`tools/playtest.js` だけに。PR にするのも その場所だけで、ほかが かわっていたら PR に しない |
| ricepia.jp の FTP の やりとりを くわしく（`debug 3`）公開の ログに 出していた | `debug 1`（接続の結果と エラーだけ）に |
| 外から読む部品（CDN）に 改ざんチェックが なかった（トラクターの three.js・店内ビデオ通話と ミーティングの PeerJS） | `integrity`（sha384）と `crossorigin` を つけた。値は npm の 同じ版の ファイルから 計算した（three.js は npm と 同じ中身を 配る jsDelivr に 読み先を そろえた）。版を上げるときは 値も 計算しなおす |

## まだ のこること

- 社内ツールを べつのサイト（べつの Vercel のプロジェクト・サブドメイン）に分ける（運営者の 設定が いる。キーは もう ブラウザに のこらないので、急ぎでは ない）
- `play-improve.yml` で Claude が書ける `tools/playtest.js` は、そのあと 同じ手順の中で 動く（入力は リポジトリの中身だけで、動かせるのは 運営者だけ）
- ricepia.jp（さくら）の ページの 外から読む部品（tailwind・chart.js など）：ricepia.jp への アップロードが いるので、運営者の OK が出たら
