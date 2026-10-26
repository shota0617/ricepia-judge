#!/bin/zsh
# 毎晩のバックアップを登録する（Mac mini の管理者ユーザーで実行）
#   sudo zsh install.sh                 登録（通知の設定は /Users/ai/.config/ricepia-agents/ads-watch.env から写す）
#   sudo zsh install.sh 設定ファイル     通知の設定を別のファイルから写す
#   sudo zsh install.sh --uninstall     登録を外す
#
# root で動かすので、スクリプトと通知の設定は root だけが書き換えられる場所に写して使う
# （AI 用ユーザーが書き換えられるファイルを root で実行しないため）。
set -eu
if [[ $EUID -ne 0 ]]; then
  echo "sudo をつけて実行してください: sudo zsh install.sh"
  exit 1
fi
DIR=${0:A:h}
LABEL=jp.ricepia.nightly-backup
LIB=/usr/local/libexec/ricepia-backup
ETC=/usr/local/etc/ricepia-backup
PLIST=/Library/LaunchDaemons/$LABEL.plist

launchctl bootout system/$LABEL 2>/dev/null || true
rm -f $PLIST
if [[ ${1:-} == --uninstall ]]; then
  rm -rf $LIB $ETC
  echo "登録を外しました"
  exit 0
fi

SRC_ENV=${1:-/Users/ai/.config/ricepia-agents/ads-watch.env}
install -d -o root -g wheel -m 755 $LIB
install -d -o root -g wheel -m 700 $ETC
install -o root -g wheel -m 755 "$DIR/nightly-backup.sh" $LIB/
install -o root -g wheel -m 644 "$DIR/../ads-watch/notify.mjs" $LIB/

# 通知に使う値だけを写す
install -o root -g wheel -m 600 /dev/null $ETC/notify.env
if [[ -f $SRC_ENV ]]; then
  grep -E '^(LINE_CHANNEL_ACCESS_TOKEN|LINE_TO_USER_ID|RESEND_API_KEY|ALERT_EMAIL_TO|ALERT_EMAIL_FROM|BACKUP_HEARTBEAT_URL)=' "$SRC_ENV" >> $ETC/notify.env || true
else
  echo "注意: 通知の設定ファイルがないため、失敗しても通知は届きません（$SRC_ENV）"
fi

sed -e "s|__LIB__|$LIB|g" "$DIR/$LABEL.plist" > $PLIST
chown root:wheel $PLIST
chmod 644 $PLIST
launchctl bootstrap system $PLIST
echo "登録しました。毎晩2時にTime Machineのバックアップを実行します（記録: /Library/Logs/ricepia-nightly-backup.log）"
echo "今すぐ1回試すには: sudo launchctl kickstart -k system/$LABEL"
