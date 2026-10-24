#!/usr/bin/env bash
# 運営者が「マージ」と 言ったあと、マージの 前に：main が すすんでいれば 取りこみ、プレイテストを やりなおし、push し、
# マージに 使う 先頭の SHA（expectedHeadSha）と、題に [skip ci] が いるかを 出す
#   ぶつかったら ここで 止まる（両方の 中身を のこして 直し、git add → git commit --no-edit → もう一度 これを 動かす）
#   プレイテストが 落ちたら --rerun と --main で、この PR の せいか、もとから ときどき 落ちる 確認かを 見分ける
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
cd "$(git rev-parse --show-toplevel)"
[ -z "$(git status --porcelain --untracked-files=no)" ] || { echo "✖ コミットして いない 変更が あります" >&2; exit 1; }
git fetch origin main -q
if git merge-base --is-ancestor origin/main HEAD; then
  echo "main は もう 取りこみずみ"
else
  echo "main に ある 新しい コミット："; git log --oneline HEAD..origin/main | sed 's/^/  /'
  git merge origin/main -m "main を取りこむ" || { echo "✖ ぶつかりました：上の ファイルを 直して git add → git commit --no-edit → もう一度"; exit 1; }
fi
node "$here/playtest.js" --rerun
"$here/push.sh"
echo "expectedHeadSha: $(git rev-parse HEAD)（マージの あと post-merge.sh の 2つめにも わたす）"
node "$here/skip-ci.js" || true
