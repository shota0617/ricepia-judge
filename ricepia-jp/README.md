# ricepia.jp トップページの更新

ricepia.jp（さくらのレンタルサーバ）の `www/index.html` を、GitHub Actions（`.github/workflows/ricepia-jp.yml`）で更新します。

1. このフォルダのファイルを変えてプッシュすると、まずサーバーのいまの `index.html` をダウンロードしてログに出します（サイトは変わりません）。
2. 更新後の内容を `ricepia-jp/index.html` に置き、`ricepia-jp/deploy.txt` に `deploy` と書いてプッシュしたときだけアップロードします。元のファイルはサーバーに `index.html.bak-日時` として残します。

シークレット `SAKURA_FTP_SERVER`・`SAKURA_FTP_USER`・`SAKURA_FTP_PASSWORD` が必要です。
