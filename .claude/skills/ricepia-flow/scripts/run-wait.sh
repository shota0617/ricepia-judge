#!/usr/bin/env bash
# Actions の ワークフローを 手で 動かした あと、その 実行が 終わるまで 待つ：run-wait.sh <ワークフローの ファイル名> [前の 実行の id]
#   動かすのは GitHub の MCP の actions_run_trigger（この 環境には gh も トークンも ない）。動かす 前に この スクリプトを 引数1つで 呼ぶと
#   いまの いちばん 新しい 実行の id が 出るので、それを 2つめに わたすと「それより 新しい 実行」が 終わるまで 待つ。
#   公開リポジトリなので、実行の ようすは トークン なしで 読める（ログの 中身は MCP の get_job_logs で 読む）
#   終わったら「id 結論 ブランチ」を 出す（結論が success 以外なら 終了コード 1）
set -euo pipefail
wf="${1:?ワークフローの ファイル名を ください（例：line-richmenu.yml）}"; after="${2:-}"
repo="${RICEPIA_REPO:-shota0617/ricepia-judge}"
latest() { curl -sSf "https://api.github.com/repos/$repo/actions/workflows/$wf/runs?per_page=1" | python3 -c "import json,sys;r=json.load(sys.stdin)['workflow_runs'];print(*(r and [r[0]['id'],r[0]['status'],r[0]['conclusion'] or '-',r[0]['head_branch']] or ['0','none','-','-']))"; }
if [ -z "$after" ]; then latest | cut -d' ' -f1; exit 0; fi
for _ in $(seq 1 60); do
  read -r id st con br < <(latest)
  if [ "$id" != "$after" ] && [ "$st" = completed ]; then echo "$id $con $br"; [ "$con" = success ]; exit; fi
  sleep 6
done
echo "6分 待っても 終わりません（いちばん 新しい 実行：$id $st）" >&2; exit 1
