# FAX → メール転送アプリ

受信したFAXを、指定したメールアドレスへ自動で転送する常駐プログラムです。

```
 FAX着信 ─▶ 複合機 / FAXモデム ─▶ 監視フォルダに保存 ─▶ 本アプリ ─▶ メール送信(PDF添付)
                                   (inbox/)                         └▶ 送信済みは inbox/sent/ へ
```

- 監視フォルダに置かれた受信FAX (PDF / TIFF / PNG / JPEG) をメールに添付して送信
- FAXでよく使われる **TIFF形式は自動でPDFに変換**(複数ページ対応、Pillow 使用)
- 書き込み途中のファイルは送らない(サイズが一定時間変わらなくなってから送信)
- 送信済みファイルは `sent/` へ移動して保管、同名ファイルは上書きしない
- 送信失敗時は間隔を空けて自動再試行、規定回数失敗したら `failed/` へ移動
- 複数の宛先に同時送信可能、件名・本文はテンプレートで変更可能
- Python 3.11 以上の標準ライブラリのみで動作(PDF変換だけ Pillow を使用)

## FAXをフォルダに保存する方法

本アプリは「受信FAXがファイルとしてフォルダに置かれる」ことを前提にしています。
お使いの環境に合わせて、次のいずれかで受信FAXを `inbox` フォルダに保存してください。

| 環境 | 設定方法 |
| --- | --- |
| 複合機 (Brother / Canon / Sharp / RICOH など) | 「FAX受信文書の転送」「受信ファクスのフォルダ保存」「PCファクス受信」などの機能で、本アプリが動くPCの共有フォルダ(SMB)を保存先に指定 |
| Raspberry Pi + USB FAXモデム | HylaFAX や efax で受信し、受信ファイルの保存先(または受信後スクリプトのコピー先)を `inbox` にする |
| クラウドFAXサービス | 受信ファイルを Dropbox / Google ドライブ等のフォルダに保存する設定にし、そのフォルダを同期して `inbox` に指定 |

## セットアップ

### 1. 準備

```bash
cd fax-to-email
pip install -r requirements.txt   # TIFF→PDF変換を使う場合
cp config.example.toml config.toml
```

### 2. 設定 (`config.toml`)

最低限、次の項目を変更してください。

```toml
[watch]
inbox = "/srv/fax/inbox"         # 受信FAXが保存されるフォルダ

[smtp]
host = "smtp.gmail.com"
port = 587
security = "starttls"
username = "your-account@gmail.com"

[mail]
from = "your-account@gmail.com"
to = ["office@example.com", "owner@example.com"]
```

SMTPのパスワードは設定ファイルに書かず、環境変数で渡すことを推奨します。

```bash
export FAX_SMTP_PASSWORD='xxxx xxxx xxxx xxxx'
```

> **Gmail を使う場合**: Googleアカウントで2段階認証を有効にし、
> 「アプリパスワード」を発行してそれを `FAX_SMTP_PASSWORD` に設定します。
> 通常のログインパスワードでは送信できません。

### 3. 送信テスト

```bash
python3 fax_forwarder.py -c config.toml --test
```

「【FAX転送】テストメール」が届けば設定は完了です。

### 4. 起動

```bash
python3 fax_forwarder.py -c config.toml
```

10秒ごと(`poll_interval`)にフォルダを確認し、新しいFAXを転送します。
`Ctrl+C` で停止します。

## 常駐させる

### Linux / Raspberry Pi (systemd)

`fax-forwarder.service` 内の手順に従って登録すると、PC起動時に自動で動き、
異常終了しても自動で再起動します。

```bash
sudo cp fax-forwarder.service /etc/systemd/system/
sudo systemctl enable --now fax-forwarder
journalctl -u fax-forwarder -f      # ログ確認
```

### cron で定期実行する場合

```cron
*/5 * * * * cd /opt/fax-to-email && FAX_SMTP_PASSWORD='...' python3 fax_forwarder.py --once
```

### Windows

タスクスケジューラで「ログオン時」または「起動時」に次を実行するよう登録します。

```
python fax_forwarder.py -c C:\fax-to-email\config.toml
```

パスワードはシステム環境変数 `FAX_SMTP_PASSWORD` に設定してください。

## 設定項目一覧

| セクション | 項目 | 既定値 | 説明 |
| --- | --- | --- | --- |
| watch | `inbox` | (必須) | 監視するフォルダ |
| watch | `archive` | `inbox/sent` | 送信済みファイルの移動先 |
| watch | `failed` | `inbox/failed` | 送信失敗ファイルの移動先 |
| watch | `extensions` | pdf, tif, tiff, png, jpg, jpeg | 転送対象の拡張子 |
| watch | `poll_interval` | 10 | 確認間隔(秒) |
| watch | `stable_seconds` | 5 | 書き込み完了とみなすまでの秒数 |
| watch | `convert_tiff_to_pdf` | true | TIFFをPDFに変換して添付 |
| watch | `max_retries` | 5 | 送信失敗時の最大試行回数 |
| smtp | `host` / `port` | (必須) / 587 | SMTPサーバー |
| smtp | `security` | starttls | `starttls` / `ssl` / `none` |
| smtp | `username` / `password` | | 認証情報(パスワードは環境変数 `FAX_SMTP_PASSWORD` 推奨) |
| mail | `from` | username | 送信元アドレス |
| mail | `to` | (必須) | 送信先(複数可) |
| mail | `subject` / `body` | | 件名・本文テンプレート |
| mail | `max_attachment_mb` | 20 | 添付の上限。超えた場合は本文で通知のみ |

件名・本文では `{received}`(受信日時)、`{filename}`(添付ファイル名)、
`{original_filename}`(元のファイル名)、`{size_kb}`(サイズ)が使えます。
日時は `{received:%Y/%m/%d %H:%M}` のように書式を指定できます。

## テスト

```bash
python3 -m unittest discover -s tests -v
```
