# ricepia.jp トップページの更新

ricepia.jp（さくらのレンタルサーバ）の `www/index.html` に、にしおさんぽGO のお知らせ欄（`game-section.html`）と、トラクターで田んぼを耕そう のお知らせ欄（`tractor-section.html`）を入れます。

| ファイル | 中身 |
| --- | --- |
| `game-section.html` | にしおさんぽGO のお知らせ欄。「動画で見る らいすぴあ」の欄のすぐ上に入れる |
| `tractor-section.html` | トラクターのゲーム（go.ricepia.jp/tractor.html）のお知らせ欄。にしおさんぽGO の欄のすぐ下に入れる。絵は go.ricepia.jp/tractor/shots/ |
| `current.html` | 公開中のトップページを保存したもの（`.github/workflows/ricepia-jp-snapshot.yml` が保存） |
| `index.html` | `current.html` にお知らせ欄を入れた案（`python3 tools/build-ricepia-jp.py` で作る）。確認用で、手でアップロードするときはこれを使う |

## GitHub Actions でアップロードする

`.github/workflows/ricepia-jp.yml` が FTPS でつなぎます。シークレット `SAKURA_FTP_SERVER`・`SAKURA_FTP_USER`・`SAKURA_FTP_PASSWORD` が必要です。

1. このフォルダを変えてプッシュすると、サーバーのいまの `index.html` をダウンロードしてログに出します（サイトは変わりません）。
2. `deploy.txt` に `deploy` と書いてプッシュしたときだけ、ダウンロードした `index.html` にお知らせ欄を入れてアップロードします。元のファイルはサーバーに `index.html.bak-日時` として残します。

さくらの「国外IPアドレスフィルタ」が有効だと、GitHub（海外のサーバー）からの FTP は止められます（あいさつ「220」の直後に切られる）。そのときは、アップロードする間だけフィルタを「無効」にする（さくらのコントロールパネル →「セキュリティ」→「国外IPアドレスフィルタ」。終わったら「有効」に戻す）か、さくらのファイルマネージャーで `index.html` を手で置き換えます。

## 元に戻す

サーバーの `www/index.html.bak-日時` を `www/index.html` に名前を戻します。お知らせ欄だけ消すときは、`<!-- nishio-go:start` から `<!-- nishio-go:end -->` まで（トラクターは `<!-- tractor:start` から `<!-- tractor:end -->` まで）を消します。

## 記録

- 2026-10-16 17:03：お知らせ欄を入れてアップロード（元のファイルは `www/index.html.bak-20261016-170334`）。アップロード後は `deploy.txt` を消してある（ふだんはフィルタを有効にしておくので、確認だけの実行で FTP につながらなくても失敗にしない）。
