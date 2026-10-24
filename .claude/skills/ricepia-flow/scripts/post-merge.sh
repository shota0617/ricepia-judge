#!/usr/bin/env bash
# マージの あとに：post-merge.sh <マージの コミットの SHA> [待つ 分＝10]
#   1. 作業用の ブランチを 新しい main から 作りなおし、マージずみの 歴史と つないで push する（force push は しない）
#   2. Vercel が main を go.ricepia.jp に 出したかを、GitHub の コミットの 状態で 見る（成功・失敗・待ちきれない まで）
#   PR の 見張りを やめる（unsubscribe_pr_activity）・確認の 予定（send_later）を 消すのは、ツールで 別に する
set -euo pipefail
sha="${1:?マージの コミットの SHA を ください}"; mins="${2:-10}"
branch="${RICEPIA_BRANCH:-claude/confident-turing-etepui}"
repo="${RICEPIA_REPO:-shota0617/ricepia-judge}"
cd "$(git rev-parse --show-toplevel)"
git fetch origin main -q
git checkout -B "$branch" origin/main -q
git fetch origin "$branch" -q
git merge -s ours "origin/$branch" -m "マージ済みのブランチの歴史をつなぐ" -q
git push -q -u origin "$branch"
git log --oneline -2
end=$(( $(date +%s) + mins * 60 ))
while :; do
  st=$(curl -s "https://api.github.com/repos/$repo/commits/$sha/status" | python3 -c 'import json,sys
d=json.load(sys.stdin); v=[s for s in d.get("statuses",[]) if s.get("context")=="Vercel"]
print((v[0]["state"]+" "+v[0].get("description","")) if v else "none")' 2>/dev/null || echo "none")
  case "$st" in
    success*) echo "Vercel：出ました（$st）"; exit 0;;
    failure*|error*) echo "Vercel：失敗（$st）"; echo "  「Account is blocked.」なら、運営者が Vercel の 画面で 戻す（docs/vercel-cost.md の 4）"; exit 2;;
  esac
  [ "$(date +%s)" -ge "$end" ] && { echo "Vercel：${mins}分 待っても 終わらない（いま：$st）"; exit 3; }
  sleep 20
done
