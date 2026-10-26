# 毎晩の自動バックアップ（Mac mini）

Mac mini につないだHDDに、**毎晩2時**に Time Machine でバックアップします。
**失敗したときだけ** LINE／メールで知らせます（通知先は広告監視エージェントと同じ設定を使います）。
成功したときは死活監視サービスに知らせるので、**Mac mini が止まっていてバックアップ自体が動かなかった夜**も、向こうから通知が届きます。

| ファイル | 役割 |
|---|---|
| `nightly-backup.sh` | バックアップ先とHDDを確かめ、Time Machine を実行し、結果を記録・通知する |
| `jp.ricepia.nightly-backup.plist` | launchd の定義（毎晩2時。root で動く） |
| `install.sh` | 登録・解除 |

## 設定の手順（Mac mini の管理者ユーザーで）

### 1. Time Machine を設定する（画面で1回だけ）
1. HDD を Mac mini につなぐ（USB-A のケーブルなら変換アダプターを使う）
2. システム設定 → 一般 → **Time Machine** → **バックアップディスクを追加** → HDD を選ぶ
3. **「バックアップを暗号化」にチェック**してパスワードを決める（1Password などに保存）
4. 同じ画面の **オプション** → **バックアップの頻度** を **「手動」** にする（夜だけ動かすため）

### 2. 死活監視を作る（任意・おすすめ）
Healthchecks.io などで「**1日ごと・猶予2時間**」のチェックを作り、その URL を
`~/.config/ricepia-agents/ads-watch.env`（AI 用ユーザー）の `BACKUP_HEARTBEAT_URL=` に入れます。

### 3. 登録する
```bash
cd ~/projects/ricepia-judge/agents/nightly-backup
sudo zsh install.sh                          # 通知の設定は /Users/ai/.config/ricepia-agents/ads-watch.env から写す
sudo launchctl kickstart -k system/jp.ricepia.nightly-backup   # 今すぐ1回試す
cat /Library/Logs/ricepia-nightly-backup.log                    # 「完了」と出れば成功
```
- 通知の設定ファイルを変えたときは、もう一度 `sudo zsh install.sh` を実行します
- やめるとき: `sudo zsh install.sh --uninstall`

## しくみと安全のための決まり

- root で動くので、スクリプトと `notify.mjs` は `/usr/local/libexec/ricepia-backup/`、通知の設定は `/usr/local/etc/ricepia-backup/notify.env`（root だけが読める）に**写してから**使います。AI 用ユーザーが書き換えられるファイルを root で実行しないためです
- 通知の設定は「名前=値」として読むだけで、シェルのコマンドとしては実行しません
- 知らせる失敗: バックアップ先が未設定／HDD が見つからない／Time Machine がエラーを返した

## うまくいかないとき

| 症状 | 確認すること |
|---|---|
| 「HDDが見つかりません」 | HDD の電源・ケーブル。Finder のサイドバーに HDD が出ているか |
| 「バックアップ先が設定されていません」 | 手順1をやり直す |
| 通知が来ない | `/usr/local/etc/ricepia-backup/notify.env` に LINE の値が入っているか（`sudo cat` で確認）。`sudo zsh install.sh` をやり直す |
| 死活監視から「届いていない」 | Mac mini が止まっていないか、記録（`/Library/Logs/ricepia-nightly-backup.log`）に「完了」があるか |
