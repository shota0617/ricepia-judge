#!/bin/zsh
# 広告監視エージェントを launchd に登録する（Mac Studio の AI 用ユーザーで実行）
#   zsh install.sh              登録（やり直しも同じ）
#   zsh install.sh --uninstall  登録を外す（集めた数字や設定ファイルは消さない）
set -eu
DIR=${0:A:h}
LA=$HOME/Library/LaunchAgents
CONF=${ADS_WATCH_ENV:-$HOME/.config/ricepia-agents/ads-watch.env}
UID_=$(id -u)

for label in jp.ricepia.ads-watch jp.ricepia.ads-report; do
  launchctl bootout "gui/$UID_/$label" 2>/dev/null || true
  rm -f "$LA/$label.plist"
done
if [[ ${1:-} == --uninstall ]]; then
  echo "登録を外しました"
  exit 0
fi

if [[ ! -f $CONF ]]; then
  echo "設定ファイルがありません: $CONF"
  echo "ads-watch.env.example をコピーして作ってください（README.md の手順2）"
  exit 1
fi
if [[ $(stat -f %Lp "$CONF") != 600 ]]; then
  chmod 600 "$CONF"
  echo "設定ファイルを本人だけが読めるようにしました（chmod 600）"
fi

mkdir -p "$LA" "$HOME/ricepia-agents/ads-watch/logs"
for label in jp.ricepia.ads-watch jp.ricepia.ads-report; do
  sed -e "s|__DIR__|$DIR|g" -e "s|__HOME__|$HOME|g" "$DIR/launchd/$label.plist" > "$LA/$label.plist"
  launchctl bootstrap "gui/$UID_" "$LA/$label.plist"
  echo "登録しました: $label"
done
echo "見張りは今から30分おき、報告は 7:30 と 20:00 に動きます。ログ: ~/ricepia-agents/ads-watch/logs/"
