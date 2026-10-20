#!/usr/bin/env bash
# このリポジトリ（.git の履歴・まだコミットしていない変更もふくむ）を restic でバックアップする
# - GitHub Actions（.github/workflows/restic-backup.yml）でも、自分のパソコン（外付けSSDへ）でも同じように使える
# - 保存先とパスワードは環境変数で渡す（チャットやファイルに書かない）
#     RESTIC_REPOSITORY  保存先。例：s3:https://<アカウントID>.r2.cloudflarestorage.com/<バケット>
#                                    /Volumes/SSD/restic-ricepia（Mac の外付けSSD）  E:\restic-ricepia（Windows）
#     RESTIC_PASSWORD    バックアップの暗号のパスワード（なくすと元に戻せない。パスワード管理アプリに保存する）
#                        かわりに RESTIC_PASSWORD_FILE・RESTIC_PASSWORD_COMMAND（Mac のキーチェーンから読むなど）でも可
#     クラウドのときは、その鍵も（S3 / R2 は AWS_ACCESS_KEY_ID・AWS_SECRET_ACCESS_KEY、B2 は B2_ACCOUNT_ID・B2_ACCOUNT_KEY）
# - 保存先がまだ空なら、はじめに作る（restic init）
# - 残す数：毎日7・毎週4・毎月12（古いものは消す）
# - 上限：保存先が RESTIC_MAX_GB（ふだん 8GB）をこえたら止まる（R2 の無料 10GB をこえないため）
# 使い方：bash tools/restic-backup.sh            （バックアップ）
#         restic snapshots / restic restore latest --target ./restore   （一覧・元に戻す）
set -euo pipefail

root=$(cd "$(dirname "$0")/.." && pwd)
: "${RESTIC_REPOSITORY:?RESTIC_REPOSITORY（保存先）を設定してください}"
if [ -z "${RESTIC_PASSWORD:-}${RESTIC_PASSWORD_FILE:-}${RESTIC_PASSWORD_COMMAND:-}" ]; then
  echo "RESTIC_PASSWORD（または RESTIC_PASSWORD_FILE・RESTIC_PASSWORD_COMMAND）を設定してください" >&2; exit 1
fi
command -v restic >/dev/null || { echo "restic が入っていません（https://restic.net/ ・ Mac は brew install restic）" >&2; exit 1; }

if ! restic cat config >/dev/null 2>&1; then
  echo "保存先がまだないので作ります：$RESTIC_REPOSITORY"
  restic init
fi

# 上限：保存先の大きさが RESTIC_MAX_GB（ふだん 8GB）をこえていたら、バックアップせずに止める
# - Cloudflare R2 は請求の上限を決められない（予算アラートはメールだけ）。無料の 10GB をこえないよう、ここで止める
# - 止まると GitHub Actions が失敗になり、GitHub からメールが届く
# - RESTIC_MAX_GB=0 で上限なし（外付けSSDなど）
max_gb=${RESTIC_MAX_GB:-8}
if [ "$max_gb" != 0 ]; then
  used=$(restic stats --mode raw-data --json | sed -n 's/.*"total_size":\([0-9]*\).*/\1/p')
  limit=$((max_gb * 1024 * 1024 * 1024))
  if [ -n "$used" ] && [ "$used" -ge "$limit" ]; then
    echo "保存先が上限をこえています：$((used / 1024 / 1024))MB ≥ ${max_gb}GB。バックアップを止めました（RESTIC_MAX_GB で変えられます）" >&2
    exit 1
  fi
  echo "保存先の大きさ：$((${used:-0} / 1024 / 1024))MB（上限 ${max_gb}GB）"
fi

host=${RESTIC_HOST:-$(hostname)}
rev=$(git -C "$root" rev-parse --short HEAD 2>/dev/null || echo none)
branch=$(git -C "$root" rev-parse --abbrev-ref HEAD 2>/dev/null || echo none)

restic backup "$root" \
  --host "$host" --tag ricepia-judge --tag "rev-$rev" --tag "branch-${branch//\//-}" \
  --exclude node_modules --exclude 'godot/*/.godot' --exclude .DS_Store --exclude '*.tmp'

restic forget --host "$host" --tag ricepia-judge --keep-daily 7 --keep-weekly 4 --keep-monthly 12 --prune
restic check
restic snapshots --host "$host" --tag ricepia-judge --latest 3
