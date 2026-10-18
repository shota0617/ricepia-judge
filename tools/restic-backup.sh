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

host=${RESTIC_HOST:-$(hostname)}
rev=$(git -C "$root" rev-parse --short HEAD 2>/dev/null || echo none)
branch=$(git -C "$root" rev-parse --abbrev-ref HEAD 2>/dev/null || echo none)

restic backup "$root" \
  --host "$host" --tag ricepia-judge --tag "rev-$rev" --tag "branch-${branch//\//-}" \
  --exclude node_modules --exclude 'godot/*/.godot' --exclude .DS_Store --exclude '*.tmp'

restic forget --host "$host" --tag ricepia-judge --keep-daily 7 --keep-weekly 4 --keep-monthly 12 --prune
restic check
restic snapshots --host "$host" --tag ricepia-judge --latest 3
