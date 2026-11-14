#!/usr/bin/env bash
# コミットする（題・本文の あとに、決まりの 2行を つける）：commit.sh "題" ["本文"]
#   変更は 先に git add しておく。コミットの 文に モデルの 名前は 書かない（Co-Authored-By の 行の ほかは）
#   RICEPIA_SESSION に セッションの URL を 入れておく（なければ いまの 値を 使う）
set -euo pipefail
title="${1:?題を ください}"; body="${2:-}"
session="${RICEPIA_SESSION:-https://claude.ai/code/session_01LKyh5zrgZ1g3dd89iSPEFE}"
coauthor="${RICEPIA_COAUTHOR:-Claude Opus 5.5 <noreply@anthropic.com>}"
if printf '%s\n%s' "$title" "$body" | grep -Eiq 'claude-(opus|sonnet|haiku|fable)|\b(opus|sonnet|haiku|fable) ?[0-9]'; then
  echo "✖ 題・本文に モデルの 名前が あります" >&2; exit 1
fi
# にしおさんぽGO の 配る 用の コピー（nishio-go/min/。サイクル215）：元の 4つ か コピーを ステージして いたら、
# ステージした 中身どうしで あって いるか 見る。あって いなければ コミットしない（ほかの ゲームの コミットには かかわらない）
top="$(git rev-parse --show-toplevel)"
if [ -f "$top/tools/strip-nishio.js" ] && git diff --cached --name-only | grep -Eq '^nishio-go/(min/)?(pixel\.js|game\.js|meiro\.js|style\.css)$'; then
  node "$top/tools/strip-nishio.js" --check --index --quiet || { echo "✖ nishio-go/min の コピーが 元と あって いない：node tools/strip-nishio.js && git add nishio-go/min してから もう 1回" >&2; exit 1; }
fi
msg="$title"
[ -n "$body" ] && msg="$msg

$body"
msg="$msg

Co-Authored-By: $coauthor
Claude-Session: $session"
git commit -q -m "$msg"
git log --oneline -1
