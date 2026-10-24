#!/usr/bin/env bash
# マージの あと：作業ブランチを 新しい main に そろえて push し、main の Vercel デプロイを 待って 結果を 出す。
# つかいかた：after-merge.sh [作業ブランチ名（省略時は いまの ブランチ）]
set -uo pipefail
ROOT="$(git -C "$(dirname "$0")" rev-parse --show-toplevel)"
cd "$ROOT"
BR="${1:-$(git branch --show-current)}"
[ -n "$BR" ] && [ "$BR" != main ] || { echo "作業ブランチが わからない（main には しない）" >&2; exit 1; }
for i in 1 2 3 4; do git fetch -q origin main && break; sleep $((2 ** i)); done
git checkout -q -B "$BR" origin/main || exit 1
for i in 1 2 3 4 5; do git push -q --force-with-lease -u origin "$BR" && break; [ $i = 5 ] && { echo "push できない" >&2; exit 1; }; sleep $((2 ** i)); done
sha="$(git rev-parse --short HEAD)"
echo "ブランチ $BR を main（$sha $(git log -1 --format=%s)）に そろえた"
exec "$(dirname "$0")/deploy-status.sh" "$sha" --wait
