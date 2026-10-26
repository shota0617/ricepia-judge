#!/bin/zsh
# 毎晩のTime Machineバックアップ（launchd から毎晩2時に root で実行）
# 終わったら結果を確かめ、失敗したときだけ LINE / メールで知らせる。
# 成功したときは BACKUP_HEARTBEAT_URL（Healthchecks.io など）に知らせる。届かない夜があれば向こうから通知が来る。
set -u
DIR=${0:A:h}
NOTIFY_ENV=${BACKUP_NOTIFY_ENV:-/usr/local/etc/ricepia-backup/notify.env}
LOG=${BACKUP_LOG:-/Library/Logs/ricepia-nightly-backup.log}
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH:/usr/sbin:/sbin"

# 通知の設定は「名前=値」を読むだけにして、シェルとして実行しない
if [[ -f $NOTIFY_ENV ]]; then
  while IFS='=' read -r key value; do
    case $key in
      LINE_CHANNEL_ACCESS_TOKEN|LINE_TO_USER_ID|RESEND_API_KEY|ALERT_EMAIL_TO|ALERT_EMAIL_FROM|BACKUP_HEARTBEAT_URL)
        value=${value#[\"\']}; value=${value%[\"\']}
        export "$key=$value" ;;
    esac
  done < "$NOTIFY_ENV"
fi

log() { print -r -- "$(date '+%Y-%m-%d %H:%M:%S') $*" >> "$LOG" }

fail() {
  log "失敗: $1"
  local body
  body=$(mktemp)
  printf '%s\n\n%s\n%s\n' "毎晩のバックアップが失敗しました。理由: $1" \
    "HDD（バックアップ用）がつながっているか、電源が入っているかを確認してください。" \
    "記録: $LOG" > "$body"
  node "$DIR/notify.mjs" "【バックアップ】失敗しました（$(scutil --get LocalHostName 2>/dev/null || hostname)）" "$body" >> "$LOG" 2>&1
  rm -f "$body"
  exit 1
}

info=$(tmutil destinationinfo 2>&1) || fail "バックアップ先が設定されていません（Time Machine の設定を確認してください）"
[[ $info == *"Mount Point"* ]] || fail "バックアップ用のHDDが見つかりません（抜けている、または電源が切れている可能性があります）"

log "開始"
out=$(tmutil startbackup --block 2>&1) || fail "Time Machine がエラーを返しました: ${out:0:300}"
log "完了"

if [[ -n ${BACKUP_HEARTBEAT_URL:-} ]]; then
  curl -fsS -m 10 "$BACKUP_HEARTBEAT_URL" > /dev/null 2>&1 || log "死活監視への通知に失敗"
fi
exit 0
