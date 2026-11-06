# ricepia.jp トップページの更新

ricepia.jp（さくらのレンタルサーバ）の `www/index.html` の「らいすぴあのゲーム」の並びに、ミシン糸 一本どり のカード（`mishin-card.html`）を入れます。農産物検査ゲームのカードの すぐ前です（運営者の 指示：2026-11-06「サイトの農産物検査ゲームの上に公開」）。

2026-11-05 に 店主の 指示で、にしおさんぽGO・トラクターの 大きな お知らせ欄は 4つの ゲームの カードの 並びに まとめられました。`tools/build-ricepia-jp.py` は もう その お知らせ欄（`game-section.html`・`tractor-section.html`）を 入れません（入れると 消した 欄が もどる）。

| ファイル | 中身 |
| --- | --- |
| `mishin-card.html` | ミシン糸 一本どり のカード（go.ricepia.jp/mishin.html）。「らいすぴあのゲーム」の並びで、農産物検査ゲームの すぐ前に入れる。絵は go.ricepia.jp/mishin-pop/card.webp（main に 入って から 見える） |
| `game-section.html` | （2026-11-05 まで）にしおさんぽGO のお知らせ欄。いまは 入れない |
| `tractor-section.html` | （2026-11-05 まで）トラクターのゲームのお知らせ欄。いまは 入れない |
| `current.html` | 公開中のトップページを保存したもの（`.github/workflows/ricepia-jp-snapshot.yml` が保存） |
| `index.html` | `current.html` にカードを入れた案（`python3 tools/build-ricepia-jp.py` で作る）。確認用で、手でアップロードするときはこれを使う |

## GitHub Actions でアップロードする

`.github/workflows/ricepia-jp.yml` が FTPS でつなぎます。シークレット `SAKURA_FTP_SERVER`・`SAKURA_FTP_USER`・`SAKURA_FTP_PASSWORD` が必要です。

1. このフォルダを変えてプッシュすると、サーバーのいまの `index.html` をダウンロードしてログに出します（サイトは変わりません）。
2. `deploy.txt` に `deploy` と書いてプッシュしたときだけ、ダウンロードした `index.html` にお知らせ欄を入れてアップロードします。元のファイルはサーバーに `index.html.bak-日時` として残します。

さくらの「国外IPアドレスフィルタ」が有効だと、GitHub（海外のサーバー）からの FTP は止められます（あいさつ「220」の直後に切られる）。そのときは、アップロードする間だけフィルタを「無効」にする（さくらのコントロールパネル →「セキュリティ」→「国外IPアドレスフィルタ」。終わったら「有効」に戻す）か、さくらのファイルマネージャーで `index.html` を手で置き換えます。

## 元に戻す

サーバーの `www/index.html.bak-日時` を `www/index.html` に名前を戻します。カードだけ消すときは、`<!-- mishin-card:start` から `<!-- mishin-card:end -->` までを消します。

## 記録

- 2026-10-16 17:03：お知らせ欄を入れてアップロード（元のファイルは `www/index.html.bak-20261016-170334`）。アップロード後は `deploy.txt` を消してある（ふだんはフィルタを有効にしておくので、確認だけの実行で FTP につながらなくても失敗にしない）。
- 2026-10-22 14:04：お知らせ欄を「スマホを傾けて、お米を転がすゲーム。」に書きかえてアップロード（元のファイルは `www/index.html.bak-20261022-140428`）。国外IPアドレスフィルタを一時的に無効にし、作業ブランチに `deploy.txt` を置いて GitHub Actions を手で動かした（main には `deploy.txt` を入れていない）。終わったらフィルタを有効に戻す
- 2026-10-22 15:05：お知らせ欄に「😆 表情が かわる お米」と表情のことを足してアップロード（元のファイルは `www/index.html.bak-20261022-150532`）。前回と同じく、作業ブランチの `deploy.txt` で GitHub Actions を手で動かした
- 2026-10-24 10:37：お知らせ欄を めいろの説明・写真と新しいタイトルロゴに書きかえてアップロード（元のファイルは `www/index.html.bak-20261024-103724`）。国外IPアドレスフィルタを一時的に無効にし、作業ブランチの `deploy.txt` で GitHub Actions を手で動かした。終わったらフィルタを有効に戻す
- 2026-10-24 11:21：お知らせ欄を「スマホを傾けて、お米を転がす西尾の めいろ。」に書きかえてアップロード（元のファイルは `www/index.html.bak-20261024-112105`）。前回と同じく、作業ブランチの `deploy.txt` で GitHub Actions を手で動かし、終わったら `deploy.txt` を消した（main には入れていない）
- 2026-10-29 10:31：お知らせ欄の めいろ図の 写真（roll.webp）を「めいろで ゴールへ」（meiro-board.webp）に差し替えてアップロード（元のファイルは `www/index.html.bak-20261029-103106`）。ゴールまでの めいろ図を ゲームから なくしたため。国外IPアドレスフィルタを一時的に無効にし、作業ブランチの `deploy.txt` で GitHub Actions を手で動かし、終わったら `deploy.txt` を消した（main には入れていない）。フィルタは 運営者が 有効に 戻した
