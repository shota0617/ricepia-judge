#!/usr/bin/env bash
# マージの あとに：post-merge.sh <マージの コミットの SHA> <マージした PR の 先頭の SHA（expectedHeadSha）> [待つ 分＝10]
#   0. マージした 先頭より あとに 積んだ コミット（手元・リモート）が あれば 止まる（消さない。新しい main の 上に 積みなおす）
#   1. 作業用の ブランチを 新しい main から 作りなおし、マージずみの 歴史と つないで push する（force push は しない）
#   2. Vercel が main を go.ricepia.jp に 出したかを、GitHub の コミットの 状態で 見る（成功・失敗・待ちきれない まで）
#   PR の 見張りを やめる（unsubscribe_pr_activity）・確認の 予定（send_later）を 消すのは、ツールで 別に する
set -euo pipefail
sha="${1:?マージの コミットの SHA を ください}"; head="${2:?マージした PR の 先頭の SHA（expectedHeadSha）を ください}"; mins="${3:-10}"
branch="${RICEPIA_BRANCH:-claude/confident-turing-etepui}"
repo="${RICEPIA_REPO:-shota0617/ricepia-judge}"
cd "$(git rev-parse --show-toplevel)"
git fetch origin main -q
git fetch origin "$branch" -q
[ -z "$(git status --porcelain --untracked-files=no)" ] || { echo "✖ コミットして いない 変更が あります（先に コミット）" >&2; exit 1; }
git merge-base --is-ancestor "$sha" origin/main || { echo "✖ $sha が origin/main に ありません（マージの SHA を 確かめる）" >&2; exit 1; }
extra=$( { git rev-list "$head..HEAD"; git rev-list "$head..origin/$branch"; } | sort -u )
if [ -n "$extra" ]; then
  echo "✖ マージした 先頭（${head:0:8}）より あとの コミットが あります。消さないよう ここで 止めます：" >&2
  for c in $extra; do git log --oneline -1 "$c" >&2; done
  echo "  新しい main から ブランチを 作り、これらを cherry-pick で 積みなおしてから push してください" >&2
  exit 1
fi
git checkout -B "$branch" origin/main -q
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
