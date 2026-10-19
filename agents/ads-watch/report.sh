#!/bin/zsh
# 広告の朝の報告と1日のまとめ（launchd から 7:30 と 20:00 に実行）
# 数字を集め直し、digest.json を Claude Code に読ませて短い報告を作り、LINE / メールで送る。
# Claude Code には道具を一切渡さない（digest.json は標準入力で渡すだけ）。
#   zsh report.sh            時刻で朝／夜を決める
#   zsh report.sh morning    朝の報告
#   zsh report.sh evening    1日のまとめ
set -u
DIR=${0:A:h}
source "$DIR/env.sh"
DATA=$ADS_WATCH_DATA_DIR

KIND=${1:-}
if [[ -z $KIND ]]; then
  if (( $(date +%H) < 12 )); then KIND=morning; else KIND=evening; fi
fi
if [[ $KIND == morning ]]; then LABEL=朝の報告; else LABEL=1日のまとめ; fi
OUT=$DATA/reports/$(date +%Y-%m-%d)-$KIND.md

# 数字を最新にする（急ぎの異常があれば、ここでも通知される）
node "$DIR/watch.mjs" || true

MODEL_ARGS=()
[[ -n ${ADS_REPORT_MODEL:-} ]] && MODEL_ARGS=(--model "$ADS_REPORT_MODEL")

cd "$DIR"
if claude -p "$(cat prompt.md)

今回は「${LABEL}」です。" "${MODEL_ARGS[@]}" \
    --disallowedTools "Bash,Edit,Write,NotebookEdit,Read,Glob,Grep,WebFetch,WebSearch" \
    < "$DATA/digest.json" > "$OUT.tmp" 2> "$DATA/logs/report-error.log" && [[ -s $OUT.tmp ]]; then
  mv "$OUT.tmp" "$OUT"
  node notify.mjs "【広告】${LABEL}（$(date +%m/%d)）" "$OUT"
else
  rm -f "$OUT.tmp"
  echo "Claude Code で報告を作れませんでした。Mac Studio の $DATA/logs/report-error.log を確認してください（ログインの期限切れ、利用枠の上限など）。" > "$OUT"
  node notify.mjs "【広告】${LABEL}を作れませんでした" "$OUT"
  exit 1
fi
