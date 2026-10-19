#!/bin/zsh
# 広告の見張り（launchd から30分おきに実行）。引数はそのまま watch.mjs に渡す
set -eu
DIR=${0:A:h}
source "$DIR/env.sh"
exec node "$DIR/watch.mjs" "$@"
