#!/usr/bin/env bash
# コミットの 前の 見はり（ステージした ものを 見る）。だめなら 理由を 出して 終了コード 1。
#  ・tools/blender/__pycache__ や *.pyc、リポジトリ直下の スクショ（*.png）、playtest-out は 入れない
#  ・ステージした .js は node --check が 通る
#  ・ステージした 差分に モデル名（claude-opus など）を 書かない
set -uo pipefail
ROOT="$(git -C "$(dirname "$0")" rev-parse --show-toplevel)"
cd "$ROOT"
files="$(git diff --cached --name-only --diff-filter=ACMR)"
[ -n "$files" ] || { echo "ステージした ファイルが ない" >&2; exit 1; }
bad=0
while IFS= read -r f; do
  case "$f" in
    *__pycache__*|*.pyc) echo "✗ 入れない：$f（__pycache__）" >&2; bad=1 ;;
    playtest-out/*) echo "✗ 入れない：$f（プレイテストの 出力）" >&2; bad=1 ;;
    */*) ;;
    *.png) echo "✗ 入れない：$f（直下の スクショ。スクショは リポジトリの 外で 撮る）" >&2; bad=1 ;;
  esac
  case "$f" in
    *.js) [ -f "$f" ] && { node --check "$f" 2>/dev/null || { echo "✗ node --check が 通らない：$f" >&2; bad=1; }; } ;;
  esac
done <<< "$files"
if git diff --cached -U0 | grep -E '^\+' | grep -v '^+++' | grep -Eiq 'claude-(opus|sonnet|haiku|fable)-[0-9]'; then
  echo "✗ 差分に モデル名が ある（コミット・PR・コードに 書かない）" >&2; bad=1
fi
[ "$bad" = 0 ] && echo "ok：$(echo "$files" | wc -l) ファイル"
exit $bad
