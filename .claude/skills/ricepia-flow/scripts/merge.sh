#!/usr/bin/env bash
# 「マージ」と 言われたら、まず これ：merge.sh <PR の 番号> [--allow-findings]
#   1. pre-merge.sh：main を 取りこむ → 見張り（--pre-merge）→ プレイテスト（--rerun）→ push
#   2. merge-plan.js：PR・先頭・Codex・[skip ci] を 確かめ、merge_pull_request に わたす 値を JSON で 出す
#   このあと GitHub の MCP ツールで squash マージし、post-merge.sh <マージの SHA> <expectedHeadSha> で あとかたづけ（SKILL.md の「マージ」）
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
pr="${1:?PR の 番号を ください}"; shift || true
"$here/pre-merge.sh"
node "$here/merge-plan.js" "$pr" "$@"
