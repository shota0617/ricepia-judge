#!/usr/bin/env bash
# 見張り（guard.js）を 通してから、作業用の ブランチへ push する。ネットの つまずきなら 2・4・8・16秒 あけて 4回まで やりなおす
# force push は しない
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
branch="${RICEPIA_BRANCH:-claude/confident-turing-etepui}"
node "$here/guard.js"
for wait in 0 2 4 8 16; do
  [ "$wait" -gt 0 ] && { echo "push を やりなおします（${wait}秒後）"; sleep "$wait"; }
  if out=$(git push -u origin "$branch" 2>&1); then echo "$out" | tail -1; git rev-parse HEAD; exit 0; fi
  echo "$out" | tail -3
  echo "$out" | grep -Eqi 'could not resolve|timed out|connection|network|unable to access|RPC failed|reset by peer|unexpected disconnect' || exit 1
done
exit 1
